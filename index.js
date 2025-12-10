import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// load env variables
dotenv.config();

// validate env variables
if (!process.env.PORT) {
  throw new Error('PORT is not set');
}

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 4006;

// Strict CORS configuration
app.use(
  cors({
    origin: '*', // Allow all origins for public files
    methods: ['GET', 'POST', 'DELETE'], // Only allow necessary methods
    credentials: false, // Disable credentials since we're using API keys
    maxAge: 3600 // Cache preflight requests for 1 hour
  })
);

// Configure file upload restrictions
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Create uploads directory if it doesn't exist
      const uploadDir = path.join(__dirname, "public", "uploads");
      if (!fs.existsSync(uploadDir)){
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (error) {
      console.error('Failed to create upload directory:', error);
      cb(new Error('Failed to create upload directory'));
    }
  },
  filename: (req, file, cb) => {
    try {
      const uploadDir = path.join(__dirname, "public", "uploads");
      let finalName = file.originalname;
      let counter = 1;
      
      // Check if file exists and append " copy" if it does
      while (fs.existsSync(path.join(uploadDir, finalName))) {
        const ext = path.extname(file.originalname);
        const nameWithoutExt = file.originalname.slice(0, -ext.length);
        finalName = `${nameWithoutExt} copy${counter}${ext}`;
        counter++;
      }
      
      cb(null, finalName);
    } catch (error) {
      console.error('Failed to generate filename:', error);
      cb(new Error('Failed to generate filename')); 
    }
  }
});

// File upload configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB limit to match client
    files: 10 // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types
    cb(null, true);
  }
}).fields([
  { name: 'file', maxCount: 1 }, // Single file upload
  { name: 'files', maxCount: 10 } // Multiple files upload
]);

// Custom upload middleware with error handling
const uploadMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        console.error('File size too large. Maximum size is 1GB');
        return res.status(400).json({
          status: false,
          message: 'File size too large. Maximum size is 1GB'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        console.error('Too many files. Maximum is 10 files per upload');
        return res.status(400).json({
          status: false,
          message: 'Too many files. Maximum is 10 files per upload'
        });
      }
      console.error(err.message);
      return res.status(400).json({
        status: false,
        message: err.message
      });
    }
    if (err) {
      console.error(err.message);
      return res.status(400).json({
        status: false,
        message: err.message
      });
    }
    next();
  });
};

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for public files
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resource sharing
  crossOriginEmbedderPolicy: false // Allow loading resources from other origins
}));
app.use(morgan('combined')); // Logging
app.use(cookieParser());
app.use(bodyParser.json({ limit: '1GB' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1GB' }));

// Error handler for body-parser
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Invalid JSON payload');
    return res.status(400).json({
      status: false,
      message: 'Invalid JSON payload'
    });
  }
  next();
});

// Serve static files from public directory with CORS enabled
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  express.static(path.join(__dirname, 'public', 'uploads'))(req, res, next);
});

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    status: false,
    message: "Too many requests from this IP, please try again later"
  }
});

// Apply rate limiting to all routes
app.use(apiLimiter);


// API Key middleware
const validateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    console.error('API key is required');
    return res.status(401).json({ 
      status: false, 
      message: 'API key is required' 
    });
  }

  try {
    const validApiKey = await prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: { user: true }
    });

    if (!validApiKey) {
      console.error('Invalid API key');
      return res.status(401).json({
        status: false,
        message: 'Invalid API key'
      });
    }

    req.user = validApiKey.user;
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({
      status: false,
      message: 'Error validating API key'
    });
  }
};

// Basic health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// File upload endpoint
app.post("/api/upload", validateApiKey, uploadMiddleware, asyncHandler(async (req, res) => {
  // Handle both single file and multiple files
  const files = [];
  
  // Add single file if present
  if (req.files.file) {
    files.push(...req.files.file);
  }
  
  // Add multiple files if present
  if (req.files.files) {
    files.push(...req.files.files);
  }

  if (files.length === 0) {
    console.error("No files uploaded");
    return res.status(400).json({
      status: false,
      message: "No files uploaded"
    });
  }

  const uploadedFiles = await Promise.all(files.map(async (file) => {
    const fileRecord = await prisma.file.create({
      data: {
        name: file.filename,
        path: `/uploads/${file.filename}`,
        size: file.size,
        mimeType: file.mimetype,
        userId: req.user.id,
        isPublic: true
      }
    });
    return fileRecord;
  }));

  res.status(200).json({
    status: true,
    files: uploadedFiles,
    message: "Files uploaded successfully"
  });
}));

// List files endpoint
app.get("/api/files", validateApiKey, asyncHandler(async (req, res) => {
  const files = await prisma.file.findMany({
    where: {
      userId: req.user.id
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  res.status(200).json({
    status: true,
    files: files
  });
}));

// Delete file endpoint
app.delete("/api/files/:fileId", validateApiKey, asyncHandler(async (req, res) => {
  const { fileId } = req.params;

  const file = await prisma.file.findUnique({
    where: { id: fileId }
  });

  if (!file) {
    console.error("File not found");
    return res.status(404).json({
      status: false,
      message: "File not found"
    });
  }

  if (file.userId !== req.user.id) {
    console.error("Not authorized to delete this file");
    return res.status(403).json({
      status: false,
      message: "Not authorized to delete this file"
    });
  }

  const filePath = path.join(__dirname, "public", file.path);
  
  try {
    // Delete from filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await prisma.file.delete({
      where: { id: fileId }
    });

    res.status(200).json({
      status: true,
      message: "File deleted successfully"
    });
  } catch (error) {
    console.error('File deletion error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to delete file'
    });
  }
}));

// Delete file by URL endpoint
app.delete("/api/files", validateApiKey, asyncHandler(async (req, res) => {
  const { url } = req.body;

  if (!url) {
    console.error("File URL is required");
    return res.status(400).json({
      status: false,
      message: "File URL is required"
    });
  }

  // Extract path from URL and find file in database
  const urlPath = url; // /uploads/filename.ext  
  
  const file = await prisma.file.findFirst({
    where: { path: urlPath }
  });

  if (!file) {
    console.error("File not found");
    return res.status(404).json({
      status: false,
      message: "File not found"
    });
  }

  if (file.userId !== req.user.id) {
    console.error("Not authorized to delete this file");
    return res.status(403).json({
      status: false,
      message: "Not authorized to delete this file"
    });
  }

  const filePath = path.join(__dirname, "public", file.path);
  
  try {
    // Delete from filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await prisma.file.delete({
      where: { id: file.id }
    });

    res.status(200).json({
      status: true,
      message: "File deleted successfully"
    });
  } catch (error) {
    console.error('File deletion error:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to delete file'
    });
  }
}));


// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    prisma.$disconnect();
    process.exit(0);
  });
});

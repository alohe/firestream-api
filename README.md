# 🔥 FireStream API - Open Source S3 Alternative

## Overview
This is a secure, rate-limited file upload API built with Express.js and Prisma. It supports API key authentication, file uploads, and file management. Uploaded files are stored locally, and metadata is recorded in a PostgreSQL database.

## Features
- Secure authentication using API keys
- File upload support (single and multiple files)
- File size limit: 1GB (can be changed in the code)
- File management endpoints (list and delete files)
- Strict CORS policies
- Rate limiting to prevent abuse 

## Installation

### Prerequisites
- Node.js (>=16.x)
- PostgreSQL database
- Prisma CLI installed globally (`npm install -g prisma`)

### Setup
1. Clone the repository:
   ```sh
   git clone https://github.com/alohe/firestream-api.git
   cd firestream-api
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Set up environment variables:
   Create a `.env` file in the root directory with the following:
   ```env
   PORT=4006
   DATABASE_URL=postgresql://user:password@localhost:5432/database
   ```
4. Run Prisma migrations:
   ```sh
   npx prisma migrate dev --name init
   ```
5. Start the server:
   ```sh
   npm start
   ```

## API Endpoints

### Health Check
- **GET `/health`**
  - Response: `{ "status": "healthy" }`

### File Upload
- **POST `/api/upload`**
  - Headers: `{ "x-api-key": "your-api-key" }`
  - Body (FormData):
    - `file`: Single file upload
    - `files`: Multiple files upload (max 10)
  - Response:
    ```json
    {
      "status": true,
      "files": [{ "name": "file1.jpg", "path": "/uploads/file1.jpg", "size": 102400 }],
      "message": "Files uploaded successfully"
    }
    ```

### List Files
- **GET `/api/files`**
  - Headers: `{ "x-api-key": "your-api-key" }`
  - Response:
    ```json
    {
      "status": true,
      "files": [
        { "id": 1, "name": "file1.jpg", "path": "/uploads/file1.jpg" }
      ]
    }
    ```

### Delete File
- **DELETE `/api/files/:fileId`**
  - Headers: `{ "x-api-key": "your-api-key" }`
  - Response:
    ```json
    {
      "status": true,
      "message": "File deleted successfully"
    }
    ```

## Security Features
- **Helmet**: Enhances API security by setting HTTP headers.
- **Rate Limiting**: Limits each IP to 100 requests per 15 minutes.
- **API Key Authentication**: Ensures only authorized users can access endpoints.

## Error Handling
Common errors include:
- `400`: Invalid request or file size exceeded
- `401`: Unauthorized (missing or invalid API key)
- `403`: Forbidden (not allowed to delete another user’s file)
- `404`: File not found
- `500`: Internal server error

## Deployment
To deploy the API:
1. Set up a PostgreSQL database.
2. Deploy the application to a server.
3. Use a process manager like PM2:
   ```sh
   pm2 start npm --name "file-upload-api" -- start
   ```
4. Configure a reverse proxy (e.g., Nginx) to forward requests to the application.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For any questions or feedback, please contact me at [hi@alohe.dev](mailto:hi@alohe.dev) or [@alemalohe](https://x.com/alemalohe).

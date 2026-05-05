# Nimbus Drive - Cloud-based File Storage and Management System

Nimbus Drive is a cloud-based file storage and management system built from a Node.js/Express REST API. The project supports user authentication, role-based authorization, file upload and management, admin management, and cloud deployment using AWS services.

This project was developed for a Cloud Computing final project. The main goal is to demonstrate a practical cloud architecture where compute, storage, database, monitoring, CDN, and access control are separated into different cloud services.

## 1. Project Overview

Nimbus Drive allows users to:

- Register and login with JWT authentication.
- Upload files through a web interface.
- Preview, download, rename, move, star, delete, restore, and permanently delete files.
- Organize files by logical folders and tags.
- Search, filter, sort, and paginate files.
- Create public share links for files.
- Use a trash bin before permanent deletion.

Admins can:

- View all files across all users.
- Manage users and user roles.
- View system-wide folders.
- View audit logs for important actions.
- Monitor system-level file usage and storage statistics.

## 2. Current Cloud Architecture

The deployed system uses the following architecture:

```txt
User Browser
  -> Domain + HTTPS: https://nimbusdrive.io.vn
  -> Application Load Balancer
  -> EC2 instances running Node.js/Express with PM2
  -> MongoDB Atlas for users and file metadata
  -> Amazon S3 for actual uploaded files
  -> AWS Lambda triggered by S3 upload events
  -> Amazon CloudWatch for Lambda logs and basic monitoring
  -> Amazon CloudFront for CDN-based file delivery support
  -> IAM for AWS access control
```

Main deployed components:

- Domain: `https://nimbusdrive.io.vn`
- S3 bucket: `file-storage-project-nhom5`
- Application Load Balancer: `nimbus-drive-alb`
- Target Group: `nimbus-drive-tg`
- Auto Scaling Group: `nimbus-drive-asg`
- Lambda function: `nimbus-drive-s3-upload-logger`
- Database: MongoDB Atlas

## 3. AWS Services Used

| Service | Purpose |
| --- | --- |
| Amazon EC2 | Runs the Node.js/Express backend application. |
| Application Load Balancer | Distributes HTTP/HTTPS requests to multiple EC2 instances. |
| Auto Scaling Group | Maintains and scales the number of EC2 instances. |
| Amazon S3 | Stores the actual uploaded files. |
| AWS Lambda | Handles S3 upload events and writes upload logs. |
| Amazon CloudWatch | Stores Lambda logs and provides monitoring metrics. |
| Amazon CloudFront | Provides CDN support for file delivery from S3. |
| IAM | Controls permissions for app access to AWS services. |
| Nginx | Reverse proxy for the Node.js app and HTTPS configuration. |
| Let's Encrypt | Provides HTTPS certificate for the domain. |

MongoDB Atlas is used as the cloud database for application data. It stores users, file metadata, folders, share links, and audit logs. The actual file content is not stored in MongoDB; it is stored in S3.

## 4. Key Features

### Authentication and Authorization

- User registration.
- User login.
- JWT-based authentication.
- User role and admin role.
- Protected API routes.
- Admin-only routes.
- Login/register error messages shown on the frontend.

### File Management

- Upload files to storage.
- Store file metadata in MongoDB.
- Preview supported file types in the browser.
- Download files.
- Rename files.
- Move files between folders.
- Star/unstar files.
- Tag files.
- Search files by name or tag.
- Filter files by type.
- Sort files by newest or other supported criteria.
- Paginate file lists.
- Soft delete files to trash.
- Restore files from trash.
- Permanently delete files.

### Folder Management

- Create logical folders.
- Upload files into selected folders.
- Move files to existing folders.
- Delete empty folders.
- Force delete folders when required.
- Restore deleted folders from trash.
- Admin can view and manage folders across users.

### Sharing

- Create file share links.
- Public preview or download through share token.
- Revoke share links.
- Share links can expire.

### Admin Dashboard

- View all files in the system.
- Upload files as admin.
- Preview and download user files.
- Manage users.
- Promote or demote roles with safeguards.
- View all folders.
- View audit logs.
- View system storage usage.

### Cloud Event Logging

- When a file is uploaded to S3, S3 triggers Lambda.
- Lambda writes event details to CloudWatch Logs.
- This demonstrates event-driven processing in the cloud.

## 5. Tech Stack

- Node.js
- Express.js
- MongoDB Atlas
- Mongoose
- JWT
- Multer
- AWS SDK for JavaScript
- Amazon S3
- AWS Lambda
- Amazon CloudWatch
- Amazon CloudFront
- Amazon EC2
- Application Load Balancer
- Auto Scaling Group
- PM2
- Nginx
- HTML, CSS, JavaScript frontend

## 6. Project Structure

```txt
config/
  db.js
controllers/
  authController.js
  fileController.js
  fileControllerV2.js
  adminController.js
helpers/
  authHelper.js
middlewares/
  authMiddleware.js
  uploadMiddleware.js
  errorMiddleware.js
  securityHeadersMiddleware.js
  rateLimitMiddleware.js
models/
  userModel.js
  fileModel.js
  folderModel.js
  auditLogModel.js
  shareLinkModel.js
routes/
  authRoute.js
  fileRoutes.js
  adminRoutes.js
services/
  adminSeedService.js
  auditLogService.js
  storage/
    index.js
    storageService.js
    localStorageService.js
    s3StorageService.js
public/
  index.html
  app.js
  styles.css
uploads/
  .gitkeep
server.js
package.json
.env.example
```

## 7. Data Models

### User

The `User` model stores account information and authorization role.

Main fields:

- `name`
- `email`
- `password` hashed before saving
- `phone`
- `address`
- `role` where `0` means user and `1` means admin
- timestamps

### File

The `File` model stores metadata only. The real file is stored in S3 or local storage depending on `STORAGE_DRIVER`.

Main fields:

- `originalFilename`: original uploaded file name
- `storedFilename`: generated unique file name
- `storagePath`: storage object path/key
- `size`: file size in bytes
- `mimeType`: file MIME type
- `uploadedBy`: user who uploaded the file
- `folder`: logical folder path
- `tags`: file tags
- `isStarred`: starred status
- `visibility`: private or public
- `isDeleted`: trash state
- `deletedAt`: deletion time
- `deletedBy`: user who deleted the file
- timestamps

### Folder

The `Folder` model stores logical folders. Folders are metadata records, not physical folders that must exist on EC2.

Main fields:

- `name`
- `path`
- `createdBy`
- `isDeleted`
- `deletedAt`
- `deletedBy`
- timestamps

### Share Link

The `ShareLink` model stores public file sharing tokens.

Main fields:

- `file`
- `token`
- `createdBy`
- `expiresAt`
- `revokedAt`
- timestamps

### Audit Log

The `AuditLog` model stores important user/admin actions.

Main fields:

- `actor`
- `action`
- `targetType`
- `targetId`
- `targetLabel`
- `metadata`
- timestamps

## 8. API Overview

Base URL in local development:

```txt
http://localhost:8080/api/v1
```

Production domain:

```txt
https://nimbusdrive.io.vn/api/v1
```

### Auth APIs

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Register a new user. |
| POST | `/auth/login` | Public | Login and receive JWT token. |
| GET | `/auth/me` | User/Admin | Get current logged-in user. |

### File APIs

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/files/upload` | User/Admin | Upload one or many files. |
| GET | `/files/my-files` | User/Admin | List current user's files. |
| GET | `/files/stats` | User/Admin | Get current user's storage stats. |
| GET | `/files/:id/preview` | Owner/Admin | Preview file. |
| GET | `/files/:id/download` | Owner/Admin | Download file. |
| PATCH | `/files/:id/meta` | Owner/Admin | Rename, move, tag, or star file. |
| DELETE | `/files/:id` | Owner/Admin | Soft delete file to trash. |
| POST | `/files/:id/restore` | Owner/Admin | Restore file from trash. |
| DELETE | `/files/:id/permanent` | Owner/Admin | Permanently delete file. |
| POST | `/files/:id/share` | Owner/Admin | Create public share link. |
| GET | `/files/shared/:token/preview` | Public | Preview shared file. |
| GET | `/files/shared/:token/download` | Public | Download shared file. |

### Folder APIs

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/files/folders` | User/Admin | List folders. |
| POST | `/files/folders` | User/Admin | Create folder. |
| DELETE | `/files/folders` | User/Admin | Delete folder. |
| POST | `/files/folders/restore` | User/Admin | Restore folder. |
| DELETE | `/files/folders/permanent` | User/Admin | Permanently delete folder. |
| PATCH | `/files/folders/move` | User/Admin | Move or rename folder path. |

### Admin APIs

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/files` | Admin | View all files. |
| GET | `/admin/stats` | Admin | View system statistics. |
| GET | `/admin/users` | Admin | View all users. |
| PATCH | `/admin/users/:id/role` | Admin | Change user role. |
| GET | `/admin/folders` | Admin | View all folders. |
| DELETE | `/admin/folders` | Admin | Delete user folder as admin. |
| GET | `/admin/audit-logs` | Admin | View audit logs. |

### Health Check

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/healthz` | Used by deployment checks and load balancer health checks. |

## 9. Environment Variables

Create a `.env` file from `.env.example`. Do not commit `.env` to GitHub.

Example structure:

```env
PORT=8080
DEV_MODE=production
MONGO_URL=your_mongodb_atlas_connection_string
JWT_SECRET=your_strong_jwt_secret
TRUST_PROXY=true
CORS_ORIGIN=*
AUTH_RATE_LIMIT_WINDOW_MS=600000
AUTH_RATE_LIMIT_MAX=20

STORAGE_DRIVER=s3
S3_USE_USER_PREFIX=false
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=file-storage-project-nhom5
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key

MAX_USER_STORAGE_MB=200

SEED_ADMIN_ON_START=false
ADMIN_NAME=System Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@123456
ADMIN_PHONE=0900000000
ADMIN_ADDRESS=HCMC
```

For local-only testing, the storage driver can be switched to local:

```env
STORAGE_DRIVER=local
```

## 10. Run Locally

Install dependencies:

```bash
npm install
```

Create `.env` and configure MongoDB, JWT secret, and storage driver.

Start the server:

```bash
npm run start
```

If the project has a development script available, it can also be started with:

```bash
npm run server
```

Open the web app:

```txt
http://localhost:8080
```

Basic local test flow:

1. Register a user.
2. Login.
3. Upload a file.
4. Preview or download the file.
5. Rename, move, star, or delete the file.
6. Restore or permanently delete from trash.
7. Login as admin and check admin pages.

## 11. Production Deployment Summary

The production deployment uses EC2, PM2, Nginx, and AWS services.

Typical deployment steps:

1. Create EC2 instance or Auto Scaling launch template.
2. Install Node.js and npm.
3. Clone the GitHub repository.
4. Run `npm install`.
5. Create `.env` directly on the server.
6. Start the app using PM2.
7. Configure Nginx as a reverse proxy.
8. Configure HTTPS using Certbot and Let's Encrypt.
9. Attach EC2 instances to the Application Load Balancer target group.
10. Configure S3, IAM, Lambda, CloudWatch, and CloudFront.

Useful PM2 commands:

```bash
pm2 start server.js --name filestorage
pm2 status
pm2 restart filestorage --update-env
pm2 logs filestorage
pm2 save
```

## 12. Demo Flow

Recommended final demo flow:

1. Open `https://nimbusdrive.io.vn`.
2. Login as a demo user.
3. Upload an image or small file.
4. Open S3 bucket and show the uploaded object.
5. Open MongoDB Atlas and show the file metadata document.
6. Open Lambda and show the S3 trigger.
7. Open CloudWatch Logs and show the upload event log.
8. Open EC2 instances and show multiple backend servers.
9. Open Target Group and show healthy targets.
10. Open Auto Scaling Group and show desired/min/max capacity.
11. Open CloudFront distribution and explain CDN support.
12. Explain IAM permissions without showing secrets.

## 13. Security Notes

- Never commit `.env` or AWS credentials.
- If an AWS access key was exposed, rotate or delete it immediately.
- Use least-privilege IAM permissions for S3 and Lambda.
- Keep MongoDB Atlas connection string private.
- Use HTTPS in production.
- Use `TRUST_PROXY=true` behind Nginx or Load Balancer.
- Consider AWS Secrets Manager or Parameter Store for production secrets.
- Restrict S3 bucket access and avoid making the bucket public unless necessary.

## 14. Future Improvements

Possible improvements after the current version:

- Integrate CloudFront more deeply into file preview/download URLs.
- Use signed URLs for private S3/CloudFront file access.
- Add Lambda-based thumbnail generation for images.
- Add Lambda-based virus scanning for uploaded files.
- Add CloudWatch alarms and SNS notifications.
- Add CI/CD deployment with GitHub Actions.
- Add AWS WAF in front of the Load Balancer.
- Move secrets to AWS Secrets Manager or SSM Parameter Store.
- Consider Amazon DocumentDB or DynamoDB if an AWS-native database is required.

## 15. Final Project Status

Current status:

- Web application is running.
- Domain and HTTPS are configured.
- Register and login work.
- User and admin roles work.
- File upload works.
- Files are stored in Amazon S3.
- Metadata is stored in MongoDB Atlas.
- Lambda receives S3 upload events.
- CloudWatch stores logs.
- Application Load Balancer distributes traffic to EC2 instances.
- Auto Scaling Group maintains multiple EC2 instances.
- CloudFront distribution has been created for CDN support.
- IAM users/policies are used for controlled AWS access.

Nimbus Drive demonstrates a cloud-based application design where compute, storage, database, monitoring, and scaling are separated into independent cloud services.

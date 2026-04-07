# Cloud-based File Storage and Management System (Backend)

Refactor + extend from original `nodejs-secure-rest-api` codebase.

Current phase focuses on stable local backend with:
- auth (register/login/JWT)
- role-based access (user/admin)
- file upload + metadata
- file list/download/delete with ownership check
- file preview (image/video/audio/pdf/txt)
- file metadata edit (rename/folder/tags/star)
- create and manage folders (logical folders)
- search, filter, sort, pagination
- quota per user (`MAX_USER_STORAGE_MB`)
- trash bin (soft delete + restore + permanent delete)
- share links (public download/preview with expiry)
- multi-file upload + drag/drop + upload progress (frontend)
- admin view all files + admin stats + user role management
- admin folder management + audit logs
- basic security hardening (security headers, CORS policy, auth rate-limit)
- health check endpoint (`GET /healthz`)
- built-in frontend demo page (no Postman required)

Later phase can switch storage from local disk to AWS S3 without rewriting business logic.

## 1. Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- Multer (upload middleware)
- MVC-style folder organization

## 2. Project Structure

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
uploads/
public/
server.js
```

## 3. MongoDB Schemas

### User
- `name` (String, required)
- `email` (String, required, unique)
- `password` (String, required, hashed)
- `phone` (String, required, unique)
- `address` (String, required)
- `role` (Number: `0=user`, `1=admin`)
- timestamps

### File
- `originalFilename` (String, required)
- `storedFilename` (String, required, unique)
- `storagePath` (String, required)
- `size` (Number, required)
- `mimeType` (String, required)
- `uploadedBy` (ObjectId -> users, required)
- `folder` (String, default `root`)
- `tags` (String[])
- `isStarred` (Boolean)
- `visibility` (`private/public`, default `private`)
- `isDeleted` (Boolean, default `false`)
- `deletedAt` (Date, nullable)
- `deletedBy` (ObjectId -> users, nullable)
- timestamps (`createdAt` is upload time)

### Folder
- `name` (String, required)
- `path` (String, required, unique per user)
- `createdBy` (ObjectId -> users, required)
- `isDeleted` (Boolean, default `false`)
- `deletedAt` (Date, nullable)
- `deletedBy` (ObjectId -> users, nullable)
- timestamps (`createdAt` is upload time)

### Share Link
- `file` (ObjectId -> files)
- `token` (String, unique)
- `createdBy` (ObjectId -> users)
- `expiresAt` (Date)
- `revokedAt` (Date, nullable)
- timestamps

### Audit Log
- `actor` (ObjectId -> users)
- `action` (String)
- `targetType` (`user/file/folder/system`)
- `targetId` (ObjectId, optional)
- `targetLabel` (String)
- `metadata` (Mixed)
- timestamps

## 4. API Endpoints

Base URL: `http://localhost:8080/api/v1`

### Auth

1. `POST /auth/register`
- Purpose: register new account
- Access: public
- Body:
```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "123456",
  "phone": "0123456789",
  "address": "HCMC"
}
```

2. `POST /auth/login`
- Purpose: login and receive JWT token
- Access: public
- Body:
```json
{
  "email": "alice@example.com",
  "password": "123456"
}
```

3. `GET /auth/me`
- Purpose: get current user info from token
- Access: `user/admin`
- Header: `Authorization: Bearer <token>`

### Files

1. `POST /files/upload`
- Purpose: upload one or many files and save metadata
- Access: `user/admin`
- Content-Type: `multipart/form-data`
- Form key: `file` or `files` (multiple)

2. `GET /files/my-files`
- Purpose: list files uploaded by current user
- Access: `user/admin`
- Query: `q, type, folder, starred, sort, page, limit`

3. `GET /files/stats`
- Purpose: get user storage stats
- Access: `user/admin`

4. `GET /files/folders`
- Purpose: list current user's folders
- Access: `user/admin`

5. `POST /files/folders`
- Purpose: create folder
- Access: `user/admin`
- Body:
```json
{
  "name": "semester8/project"
}
```

6. `DELETE /files/folders`
- Purpose: delete folder (only when empty)
- Access: `user/admin`
- Body:
```json
{
  "path": "semester8/project"
}
```

- Force delete (remove all files/subfolders):
```json
{
  "path": "semester8/project",
  "force": true
}
```

7. `GET /files/:id/preview`
- Purpose: preview media/doc files in browser
- Access: owner or admin

8. `GET /files/:id/download`
- Purpose: download file
- Access: owner or admin

9. `PATCH /files/:id/meta`
- Purpose: update metadata (`originalFilename, folder, tags, isStarred`)
- Access: owner or admin

10. `DELETE /files/:id`
- Purpose: soft delete (move file to trash)
- Access: owner or admin

11. `POST /files/:id/restore`
- Purpose: restore file from trash
- Access: owner or admin

12. `DELETE /files/:id/permanent`
- Purpose: permanently delete file metadata + storage content
- Access: owner or admin

13. `GET /files/trash/files`
- Purpose: list deleted files in current user's trash
- Access: `user/admin`

14. `GET /files/trash/folders`
- Purpose: list deleted folders in current user's trash
- Access: `user/admin`

15. `POST /files/folders/restore`
- Purpose: restore deleted folder (and folder contents)
- Access: `user/admin`

16. `DELETE /files/folders/permanent`
- Purpose: permanently delete folder and all files/subfolders in it from trash
- Access: `user/admin`
- Body:
```json
{
  "path": "semester8/project"
}
```

17. `GET /files/folders/tree`
- Purpose: get folder tree for current user (API ready, optional in UI)
- Access: `user/admin`

18. `PATCH /files/folders/move`
- Purpose: move/rename folder path and update all child folders/files
- Access: `user/admin`
- Body:
```json
{
  "fromPath": "semester8/project",
  "toPath": "semester8/final-project"
}
```

19. `POST /files/:id/share`
- Purpose: create public share link for file
- Access: owner or admin
- Body:
```json
{
  "expiresInHours": 24
}
```

20. `GET /files/:id/shares`
- Purpose: list share links of file
- Access: owner or admin

21. `DELETE /files/shares/:shareId`
- Purpose: revoke share link
- Access: owner or admin

22. `GET /files/shared/:token/download`
- Purpose: public shared download
- Access: public (valid token)

23. `GET /files/shared/:token/preview`
- Purpose: public shared preview
- Access: public (valid token)

### Admin

1. `GET /admin/files`
- Purpose: admin view all files in system
- Access: `admin`
- Query: `q, owner, type, sort, page, limit`

2. `GET /admin/stats`
- Purpose: get system stats (users/files/storage)
- Access: `admin`

3. `GET /admin/users`
- Purpose: list all users for management
- Access: `admin`

4. `PATCH /admin/users/:id/role`
- Purpose: update user role (`0` user, `1` admin)
- Access: `admin`
- Safeguard:
  - admin cannot demote self
  - system always keeps at least one admin

5. `GET /admin/folders`
- Purpose: list all folders across users
- Access: `admin`

6. `DELETE /admin/folders`
- Purpose: delete a user's folder
- Access: `admin`
- Body:
```json
{
  "ownerId": "USER_OBJECT_ID",
  "path": "semester8/project",
  "force": true
}
```

7. `GET /admin/audit-logs`
- Purpose: view admin/system actions log
- Access: `admin`

## 5. Local Run

1. Install dependencies:
```bash
npm install
```

2. Create `.env` from `.env.example`:
```env
PORT=8080
DEV_MODE=development
MONGO_URL=mongodb://127.0.0.1:27017/nodejs-secure-rest-api
JWT_SECRET=change_me_please
TRUST_PROXY=false
CORS_ORIGIN=*
AUTH_RATE_LIMIT_WINDOW_MS=600000
AUTH_RATE_LIMIT_MAX=20
STORAGE_DRIVER=local
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
MAX_USER_STORAGE_MB=200
SEED_ADMIN_ON_START=false
ADMIN_NAME=System Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@123456
ADMIN_PHONE=0900000000
ADMIN_ADDRESS=HCMC
```

3. Start server:
```bash
npm run start
```
or dev mode:
```bash
npm run server
```

4. Open frontend demo:
- `http://localhost:8080/`
- Register -> Login -> Upload -> Preview -> Download/Delete
- Use search/filter/sort and folder/tags
- If account role is admin (`role=1` in MongoDB), use:
  - `Admin: All Files`
  - `Admin: Users`
- Health check:
  - `GET http://localhost:8080/healthz`

5. Optional: auto seed admin on startup
- Set in `.env`:
```env
SEED_ADMIN_ON_START=true
ADMIN_NAME=System Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@123456
ADMIN_PHONE=0900000000
ADMIN_ADDRESS=HCMC
```
- Restart server. If user `ADMIN_EMAIL` exists, system upgrades role to admin.

## 6. Frontend Demo Features
- Auth screen (register/login)
- My Drive dashboard with file cards
- Multi-file upload (select many files or drag/drop)
- Upload progress bar
- Preview modal for image/video/audio/pdf/txt
- Metadata actions: star, rename, move folder
- Trash bin with restore/permanent delete
- File sharing link (copy link)
- Admin panel: list users and change roles
- Admin panel: browse all files system-wide
- Admin panel: browse folders system-wide and force-delete
- Admin panel: view audit logs

## 7. Cloud-Ready Design (Next Step)

Current implementation uses `STORAGE_DRIVER=local` (via `services/storage/index.js`).
To migrate to AWS S3 later:

1. Implement `s3StorageService` with real AWS SDK calls (stub already exists):
- `saveBuffer(file, userId)`
- `deleteFile(storagePath)`
- `getAbsolutePath(storagePath)` (or refactor to signed URL flow)

2. Set `.env`:
```env
STORAGE_DRIVER=s3
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=your-bucket
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

This keeps APIs, DB schema, and RBAC mostly unchanged while swapping storage backend.


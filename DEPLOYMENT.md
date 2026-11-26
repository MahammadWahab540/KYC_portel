# NxtWave KYC - Production Deployment & Cloud Architecture (DEPLOYMENT.md)

## 1. Infrastructure Specifications

- **Containerization**: Multi-stage Docker build for React/Vite frontend (Nginx alpine) and FastAPI/DRF backend (Uvicorn / Gunicorn).
- **Database**: Managed PostgreSQL (AWS RDS / Supabase) with automated backups and read-replicas.
- **Object Storage**: AWS S3 or Cloudflare R2 with encrypted buckets and presigned URL access.
- **Redis Queue**: Celery/Redis for asynchronous OCR processing and webhook reconciliation.

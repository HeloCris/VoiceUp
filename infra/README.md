# VoiceUp Infrastructure

Terraform configuration for provisioning Google Cloud resources.

## Modules
- `projects`: Creates dev/staging/prod projects with IAM bindings
- `storage`: Buckets for raw and processed recordings with lifecycle rules
- `firestore`: Native mode Firestore database setup
- `cloudrun`: Services for API and worker with Cloud Build deploy triggers
- `scheduler`: Cleanup jobs for recording retention

## Getting Started
1. Install Terraform >= 1.6
2. Authenticate with `gcloud auth application-default login`
3. Copy `terraform.tfvars.example` to `terraform.tfvars`
4. Run `terraform init && terraform plan`

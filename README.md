# Inkstream

![AWS](https://img.shields.io/badge/AWS-CDK%20%7C%20Lambda%20%7C%20Step%20Functions%20%7C%20S3%20%7C%20DynamoDB%20%7C%20Cognito-orange)
![React](https://img.shields.io/badge/Frontend-React-blue)

---

**Inkstream** is a modern, full-stack serverless web application built on AWS, designed for seamless document processing and language transformation. Users can upload images or PDFs, which are then automatically processed through a robust, AI-powered workflow.

## ✨ What Does Inkstream Do?

1. **Upload**: Users upload images or PDFs via a React-based single-page app (SPA).
2. **Text Extraction**: Documents are processed using **Amazon Textract** to extract text.
3. **AI Reformat & Translation**: The extracted text is sent to an LLM (**Anthropic Claude 3 Haiku** on **Amazon Bedrock**) for reformatting and/or translation.
4. **Text-to-Speech (Optional)**: The processed text can be converted to speech using **Amazon Polly**.
5. **Storage & Tracking**: All files and metadata are securely stored in **Amazon S3** and **DynamoDB**.
6. **Authentication**: Secure sign-in with **Amazon Cognito** (federated with Google).
7. **Workflow Orchestration**: All backend processing is orchestrated using **AWS Step Functions** and **AWS Lambda**.

---

## 🛠️ Technologies Used

- **Frontend**: React application (Vite, TypeScript, Tailwind)
- **Monorepo**: npm workspaces for code sharing and scalable development
- **Backend**:
  - **API Gateway**: Serverless HTTP endpoints
  - **AWS Lambda**: Stateless compute for all backend logic
  - **AWS Step Functions**: Workflow orchestration
  - **Amazon Textract**: OCR for text extraction
  - **Amazon Bedrock**: LLM-powered text reformatting/translation (Claude 3 Haiku)
  - **Amazon Polly**: Text-to-speech
  - **Amazon S3**: File storage
  - **Amazon DynamoDB**: User and file metadata
  - **Amazon Cognito**: Authentication (with Google federation)
  - **AWS CDK**: Infrastructure as code (TypeScript)

---

## 📦 Monorepo Structure

- `apps/frontend/` – React frontend (Vite, TypeScript, Tailwind)
- `packages/aws-cdk-infra/` – AWS CDK infrastructure (Step Functions, Lambdas, API Gateway, S3, DynamoDB, Cognito, etc.)

---

## 🚀 Quick Start

This project uses npm workspaces. Commands are typically run from the root of the monorepo.

1. **Install all dependencies:** (From the project root, this installs dependencies for all workspaces)

   ```sh
   npm install
   ```

2. **Run the frontend app:** (Starts the Vite development server for `apps/frontend`)

   ```sh
   npm run dev:frontend
   ```

3. **Deploy the AWS CDK infrastructure:** (Deploys AWS resources defined in `packages/aws-cdk-infra`)

   ```sh
   npm run deploy:infra
   ```

   *Note: You might have other scripts like `npm run synth:infra` or `npm run diff:infra` for specific CDK actions, or you can use `npx cdk <command>` directly within the `packages/aws-cdk-infra` directory (see below).*

---

## Running the Frontend (React + Vite)

The frontend application is located in `apps/frontend/`. While `npm run dev:frontend` from the root is recommended, you can also run it directly:

```sh
cd apps/frontend
npm install # Usually not needed if root `npm install` was run
npm run dev   # Starts the Vite development server
```

## Working with AWS CDK Infrastructure

The AWS CDK infrastructure code is in `packages/aws-cdk-infra/`. While root-level scripts like `npm run deploy:infra` are recommended for common tasks, you can run specific CDK commands directly:

```sh
cd packages/aws-cdk-infra
npm install # Usually not needed if root `npm install` was run
# Replace <command> with any CDK command, e.g., synth, diff, bootstrap, deploy, etc.
npx npm run cdk:<command>:<env> # e.g., npx npm run cdk:deploy:dev
```

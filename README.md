# Inkstream

![AWS](https://img.shields.io/badge/AWS-CDK%20%7C%20Lambda%20%7C%20Step%20Functions%20%7C%20S3%20%7C%20DynamoDB%20%7C%20Cognito-orange)
![React](https://img.shields.io/badge/Frontend-React-blue)
![Nx](https://img.shields.io/badge/Monorepo-Nx-informational)

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

- **Frontend**: [Next.js](https://nextjs.org/) Next.js React application (TypeScript, Tailwind)
- **Monorepo**: [Nx](https://nx.dev/) for code sharing, CI, and scalable development
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

- `apps/inkstream/` – React frontend
- `libs/aws-cdk-infra/` – AWS CDK infrastructure (Step Functions, Lambdas, API Gateway, S3, DynamoDB, Cognito, etc.)
- `libs/shared-types/` – Shared TypeScript types

---

## 🚀 Quick Start

1. **Install dependencies:**

   ```sh
   npm install
   ```

2. **Deploy AWS infrastructure:**

   ```sh
   npx nx run aws-cdk-infra:cdk:deploy:dev
   ```

3. **Run the frontend locally:**

   ```sh
   npx nx dev inkstream
   ```

---

## 🌍 Why Inkstream?

- **End-to-end serverless**: No servers to manage, infinite scalability
- **AI-powered**: Uses state-of-the-art LLMs and AWS AI services
- **Modern developer experience**: Monorepo, Nx, TypeScript, CDK

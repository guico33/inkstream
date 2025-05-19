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

1. **Install dependencies:**
   ```sh
   npm install
   ```
2. **Run the frontend app:**
   ```sh
   npm run dev:frontend
   ```
3. **Run or deploy the CDK infrastructure:**
   ```sh
   npm run dev:infra
   # or
   npm run deploy:infra
   ```

---

## Running the Frontend (React + Vite)

```sh
cd apps/frontend
npm install
npm run dev
```

## Working with AWS CDK Infrastructure

```sh
cd packages/aws-cdk-infra
npm install
# Replace <command> with your CDK command, e.g. synth, deploy, etc.
npx cdk <command>
```

---

For more details, see the README in each package.

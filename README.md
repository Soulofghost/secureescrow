# SecureEscrow | Smart Contract Milestone & Dispute Arbitration Platform

[![CI Pipeline](https://github.com/Soulofghost/secureescrow/actions/workflows/ci.yml/badge.svg)](https://github.com/Soulofghost/secureescrow/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Solidity 0.8.20](https://img.shields.io/badge/Solidity-0.8.20-blueviolet.svg)](https://soliditylang.org/)
[![Node.js v22+](https://img.shields.io/badge/Node.js-v22%2B-brightgreen.svg)](https://nodejs.org/)
[![Ethers.js v6](https://img.shields.io/badge/Ethers.js-v6.13-blue.svg)](https://docs.ethers.org/)
[![SQLite WAL](https://img.shields.io/badge/SQLite-WAL%20Engine-orange.svg)](https://www.sqlite.org/)

---

## 1. Project Introduction

**SecureEscrow** is a decentralized, trustless milestone escrow platform built on EVM smart contracts (Solidity 0.8.20) and a Node.js backend ledger. Designed for cross-border software development agreements, enterprise procurement, and professional freelance engagements, SecureEscrow locks buyer collateral on-chain and releases funds proportionally upon verified deliverable approval, backed by a cryptographic dispute arbitration engine.

---

## 2. Problem Statement

Cross-border contract engagements suffer from fundamental counterparty payment risks:
- **Contractor Non-Payment Risk:** Freelancers and agencies risk delivering completed work without receiving final payment.
- **Buyer Default & Fraud Risk:** Clients risk paying upfront deposits to offshore contractors who fail to deliver.
- **Predatory Intermediary Fees:** Traditional centralized escrow providers extract 3% to 6% transaction fees and impose weeks-long dispute settlement delays.

---

## 3. Proposed Solution

SecureEscrow resolves payment trust gaps through immutable code:
- **Milestone-Based Fund Locking:** Collateral is deposited once into the smart contract and released incrementally per agreed deliverable.
- **Reentrancy-Protected Solidity Architecture:** Compliant with OpenZeppelin security standards, utilizing checks-effects-interactions and mutex guards.
- **Three-Party Arbitration State Machine:** Designated arbitrators or multisig governance hold sole authority to divide or refund locked balances during disputes.

---

## 4. Key Features

- **Multi-Phase Milestone Decomposition:** Define customized milestone deliverables with independent valuations in Ether or ERC-20 tokens.
- **Evidence Verification Protocol:** Contractors submit cryptographic artifacts (commit hashes, release URLs, IPFS proofs) alongside milestone claims.
- **Autonomous Release Engine:** Buyers approve milestones with one click, triggering instantaneous on-chain disbursement directly to contractor wallets.
- **Formal Dispute Mediation:** Buyers or contractors can freeze state into `DISPUTED`, allowing designated arbitrators to adjudicate proportional splits.
- **Complete Cryptographic Audit Trail:** Chronological event logs tracking every state transition, deposit, milestone submission, and ruling.

---

## 5. Architecture Diagram

```mermaid
flowchart TD
    Buyer["Buyer Wallet (Funder)"]
    Seller["Seller Wallet (Contractor)"]
    Arb["Arbitrator Wallet (Mediator)"]
    Contract["MilestoneEscrow.sol (EVM Contract)"]
    API["Express REST API (/api/v1)"]
    Ledger[("SQLite WAL Ledger (secureescrow.db)")]

    Buyer -->|1. Deposit Collateral (Total ETH)| Contract
    Seller -->|2. Submit Deliverable Proof| Contract
    Buyer -->|3. Approve & Disburse Payment| Contract
    Buyer -.->|4. Raise Dispute (if unsatisfied)| Contract
    Arb -.->|5. Arbitrate Split / Refund| Contract

    Contract -->|Emit On-Chain Events| API
    API -->|Synchronize Status & Milestones| Ledger
```

---

## 6. Technology Stack

- **Smart Contract Language:** Solidity 0.8.20
- **Contract Standards:** ReentrancyGuard, Checks-Effects-Interactions, PullPayment pattern
- **Runtime & API:** Node.js v22+, Express.js 4.19
- **Web3 Integration:** Ethers.js v6.13
- **Database Engine:** `node:sqlite` (SQLite 3 WAL)
- **Frontend Architecture:** Vanilla ES6 SPA, HTML5, CSS Variables, Plus Jakarta Sans & JetBrains Mono typography
- **DevOps:** Docker, Docker Compose, GitHub Actions CI
- **Automated Testing:** Node native test runner (`node:test`, `node:assert/strict`)

---

## 7. Folder Structure

```
secureescrow/
├── .github/
│   └── workflows/
│       └── ci.yml
├── contracts/
│   └── MilestoneEscrow.sol
├── backend/
│   ├── src/
│   │   ├── engine/
│   │   │   └── escrowManager.js
│   │   ├── routes/
│   │   │   └── escrowRoutes.js
│   │   ├── db.js
│   │   └── server.js
│   ├── tests/
│   │   └── escrow.test.js
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── app.js
│   ├── index.html
│   └── style.css
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── LICENSE
└── README.md
```

---

## 8. Installation Instructions

### Prerequisites
- Node.js 22.x or later
- npm or yarn

### Setup Steps
```bash
git clone https://github.com/Soulofghost/secureescrow.git
cd secureescrow/backend
npm install
npm start
```

Access the platform at `http://localhost:8009`.

---

## 9. Environment Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `8009` | HTTP server port |
| `SECUREESCROW_DB` | `./backend/data/secureescrow.db` | SQLite database file location |
| `NODE_ENV` | `development` | Runtime environment flag |

---

## 10. Database Setup

Database schema, indexes, and demonstration milestone agreements are initialized automatically on launch via `initDb()`:
```javascript
import { initDb } from './src/db.js';
initDb();
```

---

## 11. API Documentation

### Primary Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service health status check |
| `GET` | `/api/v1/escrows` | List active escrow agreements |
| `POST` | `/api/v1/escrows` | Deploy new milestone agreement |
| `GET` | `/api/v1/escrows/:id` | Full contract details, milestones & audit log |
| `POST` | `/api/v1/escrows/:id/deposit` | Lock buyer collateral in vault |
| `POST` | `/api/v1/escrows/:id/milestones/:msId/submit` | Contractor submits deliverable proof |
| `POST` | `/api/v1/escrows/:id/milestones/:msId/release` | Buyer approves & disburses milestone payment |
| `POST` | `/api/v1/escrows/:id/dispute` | Freeze contract and initiate arbitration |
| `POST` | `/api/v1/escrows/:id/arbitrate` | Arbitrator issues binding split ruling |

---

## 12. Application Interface Overview

SecureEscrow provides an institutional FinTech workflow:
- **Role Switcher Pill:** Test and execute actions as Buyer, Contractor/Seller, or Arbitrator.
- **Agreement Top Summary:** Visual locked vault balance alongside total disbursed contract funds.
- **Interactive Milestone Checklist:** Real-time deliverable submission links, approval status, and release triggers.
- **Dispute Mediation Suite:** Form for arbitrators to balance refunds against contractor payouts.
- **Cryptographic Event Log:** Real-time log of state transitions.

---

## 13. Testing Instructions

Execute the automated test suite covering full contract state transitions:

```bash
cd backend
npm test
```

Expected output:
```
▶ SecureEscrow Smart Contract Engine Tests
  ✔ Database seeds demo contracts with milestones and audit events
  ✔ createContract initializes contract in AWAITING_PAYMENT state
  ✔ depositFunds locks collateral and transitions state to FUNDED
  ✔ Milestone lifecycle: submission by seller and release by buyer
  ✔ Dispute & Arbitration: freezes funds and enables arbitrator resolution
✔ SecureEscrow Smart Contract Engine Tests (53ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

---

## 14. Security Considerations

- **Reentrancy Lock:** Solidity `nonReentrant` modifier prevents reentrancy during external calls.
- **Pull Payment & Direct Call Checks:** Milestone disbursement verifies transfer success before updating internal state.
- **Strict Role Authorization:** State changes are strictly gated by caller address verification (`onlyBuyer`, `onlySeller`, `onlyArbitrator`).
- **Exact Balance Match Invariant:** Arbitration rulings require `buyerRefund + sellerPayout == remainingBalance`, preventing orphaned contract funds.

---

## 15. Deployment Instructions

### Docker Deployment
```bash
docker compose up -d --build
```
Access the application at `http://localhost:8009`.

---

## 16. Known Limitations

- Current demonstration frontend interacts with the local simulated ledger engine; on-chain mainnet deployment requires configuring an active Web3 provider (e.g. MetaMask / WalletConnect).

---

## 17. Future Roadmap

- [ ] Web3 wallet integration (MetaMask, Coinbase Wallet, WalletConnect).
- [ ] ERC-20 stablecoin settlement (USDC, USDT, DAI) via SafeERC20.
- [ ] Decentralized arbitration via Kleros or Aragon court integration.
- [ ] Time-locked auto-approval if buyer does not review deliverable within 14 days.

---

## 18. License

SPDX-License-Identifier: MIT
Copyright (c) 2026 Alvin MS (@Soulofghost). All rights reserved.

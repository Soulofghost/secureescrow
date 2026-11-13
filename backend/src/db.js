import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

const dbPath = process.env.SECUREESCROW_DB || join(DATA_DIR, 'secureescrow.db');
export const db = new DatabaseSync(dbPath);

// Enable WAL mode & foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      contract_address TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      buyer_address TEXT NOT NULL,
      seller_address TEXT NOT NULL,
      arbitrator_address TEXT NOT NULL,
      total_amount_eth REAL NOT NULL,
      released_amount_eth REAL NOT NULL DEFAULT 0.0,
      state TEXT NOT NULL CHECK(state IN ('AWAITING_PAYMENT', 'FUNDED', 'DISPUTED', 'COMPLETED', 'REFUNDED')),
      dispute_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      milestone_index INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount_eth REAL NOT NULL,
      is_submitted INTEGER NOT NULL DEFAULT 0,
      is_approved INTEGER NOT NULL DEFAULT 0,
      is_released INTEGER NOT NULL DEFAULT 0,
      evidence_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      actor_address TEXT NOT NULL,
      details TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    );
  `);

  const count = db.prepare('SELECT count(*) as count FROM contracts').get().count;
  if (count === 0) {
    seedDemoEscrow();
  }
}

function seedDemoEscrow() {
  const insertContract = db.prepare(`
    INSERT INTO contracts (id, contract_address, title, buyer_address, seller_address, arbitrator_address, total_amount_eth, released_amount_eth, state, dispute_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMilestone = db.prepare(`
    INSERT INTO milestones (id, contract_id, milestone_index, description, amount_eth, is_submitted, is_approved, is_released, evidence_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (id, contract_id, event_name, actor_address, details)
    VALUES (?, ?, ?, ?, ?)
  `);

  const buyer = '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
  const seller = '0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e';
  const arbitrator = '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d';

  // Contract 1: In progress
  insertContract.run(
    'escrow-001',
    '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    'Enterprise Cloud Telematics Firmware & Integration',
    buyer,
    seller,
    arbitrator,
    6.0,
    2.0,
    'FUNDED',
    null
  );

  insertMilestone.run('ms-1', 'escrow-001', 0, 'Phase 1: Architecture Specification & Security Threat Model', 2.0, 1, 1, 1, 'https://github.com/vanguard/specs/releases/tag/v1.0.0');
  insertMilestone.run('ms-2', 'escrow-001', 1, 'Phase 2: Firmware Prototype & CAN Bus Ingestion Engine', 2.5, 1, 0, 0, 'https://github.com/vanguard/firmware/commit/8a9f4c2');
  insertMilestone.run('ms-3', 'escrow-001', 2, 'Phase 3: Final Acceptance Testing, Pen-Test Report & Production Handover', 1.5, 0, 0, 0, null);

  insertEvent.run('ev-1', 'escrow-001', 'ContractCreated', buyer, 'Initialized contract with 3 milestones totaling 6.0 ETH');
  insertEvent.run('ev-2', 'escrow-001', 'Deposited', buyer, 'Deposited full locked balance of 6.0 ETH into escrow contract');
  insertEvent.run('ev-3', 'escrow-001', 'MilestoneReleased', buyer, 'Approved Phase 1. Disbursed 2.0 ETH directly to contractor.');
  insertEvent.run('ev-4', 'escrow-001', 'MilestoneSubmitted', seller, 'Submitted Phase 2 deliverable for verification.');

  // Contract 2: Disputed
  insertContract.run(
    'escrow-002',
    '0x28C6c06298d514Db089934071355E5743bf21d60',
    'Zero-Knowledge Proof Audit & Benchmark Suite',
    buyer,
    seller,
    arbitrator,
    4.0,
    0.0,
    'DISPUTED',
    'Contractor missed benchmark latency criteria; delivered unoptimized circuits.'
  );

  insertMilestone.run('ms-4', 'escrow-002', 0, 'ZK Circuit Formal Verification', 2.0, 1, 0, 0, 'https://zk-audit.io/deliverables/m1');
  insertMilestone.run('ms-5', 'escrow-002', 1, 'Prover Benchmarking on GPUs', 2.0, 0, 0, 0, null);

  insertEvent.run('ev-5', 'escrow-002', 'ContractCreated', buyer, 'Created escrow agreement for 4.0 ETH');
  insertEvent.run('ev-6', 'escrow-002', 'Deposited', buyer, 'Funded 4.0 ETH');
  insertEvent.run('ev-7', 'escrow-002', 'DisputeRaised', buyer, 'Raised formal arbitration dispute over benchmark latency criteria');
}

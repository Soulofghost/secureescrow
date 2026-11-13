import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { db, initDb } from '../src/db.js';
import { escrowManager } from '../src/engine/escrowManager.js';

describe('SecureEscrow Smart Contract Engine Tests', () => {
  before(() => {
    initDb();
  });

  const testBuyer = '0x1111111111111111111111111111111111111111';
  const testSeller = '0x2222222222222222222222222222222222222222';
  const testArbitrator = '0x3333333333333333333333333333333333333333';

  test('Database seeds demo contracts with milestones and audit events', () => {
    const contracts = escrowManager.listContracts();
    assert.ok(contracts.length >= 2, 'Should have at least 2 seeded contracts');

    const details = escrowManager.getContractDetails('escrow-001');
    assert.ok(details, 'Escrow 001 should exist');
    assert.equal(details.milestones.length, 3);
    assert.equal(details.state, 'FUNDED');
    assert.equal(details.remaining_locked_eth, 4.0);
  });

  test('createContract initializes contract in AWAITING_PAYMENT state', () => {
    const created = escrowManager.createContract({
      title: 'Decentralized Oracle Integration',
      buyer: testBuyer,
      seller: testSeller,
      arbitrator: testArbitrator,
      milestones: [
        { description: 'Milestone 1: Price Feed Adapter', amount_eth: 1.5 },
        { description: 'Milestone 2: VRF Randomness Validator', amount_eth: 2.0 }
      ]
    });

    assert.ok(created.id.startsWith('escrow-'));
    assert.ok(created.contract_address.startsWith('0x'));
    assert.equal(created.state, 'AWAITING_PAYMENT');
    assert.equal(created.total_amount_eth, 3.5);
    assert.equal(created.milestones.length, 2);
  });

  test('depositFunds locks collateral and transitions state to FUNDED', () => {
    // Create new agreement
    const contract = escrowManager.createContract({
      title: 'Full Stack App Deployment',
      buyer: testBuyer,
      seller: testSeller,
      arbitrator: testArbitrator,
      milestones: [{ description: 'Core Build', amount_eth: 5.0 }]
    });

    // Unauthorized deposit attempt by non-buyer
    assert.throws(() => {
      escrowManager.depositFunds(contract.id, testSeller, 5.0);
    }, /Only the designated buyer address can deposit/);

    // Mismatched amount attempt
    assert.throws(() => {
      escrowManager.depositFunds(contract.id, testBuyer, 2.0);
    }, /Deposit amount must exactly equal total agreement value/);

    // Successful deposit
    const funded = escrowManager.depositFunds(contract.id, testBuyer, 5.0);
    assert.equal(funded.state, 'FUNDED');
  });

  test('Milestone lifecycle: submission by seller and release by buyer', () => {
    const contract = escrowManager.createContract({
      title: 'Rust Node Optimization',
      buyer: testBuyer,
      seller: testSeller,
      arbitrator: testArbitrator,
      milestones: [
        { description: 'Memory Profiling', amount_eth: 1.0 },
        { description: 'Async Tokio Refactor', amount_eth: 2.0 }
      ]
    });
    escrowManager.depositFunds(contract.id, testBuyer, 3.0);

    const ms1 = contract.milestones[0];
    const ms2 = contract.milestones[1];

    // Seller submits milestone 1
    const submitted = escrowManager.submitMilestone(contract.id, ms1.id, testSeller, 'https://github.com/pull/42');
    const updatedMs1 = submitted.milestones.find(m => m.id === ms1.id);
    assert.equal(updatedMs1.is_submitted, 1);
    assert.equal(updatedMs1.evidence_url, 'https://github.com/pull/42');

    // Buyer releases milestone 1
    const released1 = escrowManager.releaseMilestone(contract.id, ms1.id, testBuyer);
    assert.equal(released1.released_amount_eth, 1.0);
    assert.equal(released1.state, 'FUNDED'); // Still has ms2 pending

    // Buyer releases milestone 2 => transitions to COMPLETED
    const released2 = escrowManager.releaseMilestone(contract.id, ms2.id, testBuyer);
    assert.equal(released2.released_amount_eth, 3.0);
    assert.equal(released2.state, 'COMPLETED');
  });

  test('Dispute & Arbitration: freezes funds and enables arbitrator resolution', () => {
    const contract = escrowManager.createContract({
      title: 'Solidity Compiler Fuzzing',
      buyer: testBuyer,
      seller: testSeller,
      arbitrator: testArbitrator,
      milestones: [{ description: 'Fuzzing Harness', amount_eth: 10.0 }]
    });
    escrowManager.depositFunds(contract.id, testBuyer, 10.0);

    // Buyer raises dispute
    const disputed = escrowManager.raiseDispute(contract.id, testBuyer, 'Deliverable failed invariant tests.');
    assert.equal(disputed.state, 'DISPUTED');
    assert.equal(disputed.dispute_reason, 'Deliverable failed invariant tests.');

    // Unauthorized resolution attempt by seller
    assert.throws(() => {
      escrowManager.resolveDispute(contract.id, testSeller, 5.0, 5.0);
    }, /Only the designated arbitrator can resolve disputes/);

    // Resolution sum mismatch
    assert.throws(() => {
      escrowManager.resolveDispute(contract.id, testArbitrator, 4.0, 4.0); // 8 != 10
    }, /Resolution sum/);

    // Arbitrator resolves: 7 ETH refund to buyer, 3 ETH payout to contractor
    const resolved = escrowManager.resolveDispute(contract.id, testArbitrator, 7.0, 3.0);
    assert.equal(resolved.state, 'COMPLETED');
    assert.equal(resolved.released_amount_eth, 3.0);
  });
});

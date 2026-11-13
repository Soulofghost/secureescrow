import { db } from '../db.js';
import crypto from 'node:crypto';
import { ethers } from 'ethers';

export class EscrowManager {
  createContract({ title, buyer, seller, arbitrator, milestones }) {
    if (!title || !buyer || !seller || !arbitrator || !milestones || milestones.length === 0) {
      throw new Error('Missing required contract configuration parameters.');
    }

    const contractId = 'escrow-' + crypto.randomUUID().slice(0, 8);
    // Generate simulated EVM contract address
    const contractAddress = ethers.getCreateAddress({
      from: buyer,
      nonce: Math.floor(Math.random() * 1000)
    });

    const totalAmount = milestones.reduce((sum, m) => sum + Number(m.amount_eth), 0);
    if (totalAmount <= 0) throw new Error('Total milestone value must be greater than zero.');

    db.prepare(`
      INSERT INTO contracts (id, contract_address, title, buyer_address, seller_address, arbitrator_address, total_amount_eth, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'AWAITING_PAYMENT')
    `).run(contractId, contractAddress, title.trim(), buyer.toLowerCase(), seller.toLowerCase(), arbitrator.toLowerCase(), totalAmount);

    // Insert milestones
    const insertMs = db.prepare(`
      INSERT INTO milestones (id, contract_id, milestone_index, description, amount_eth)
      VALUES (?, ?, ?, ?, ?)
    `);

    milestones.forEach((m, idx) => {
      const msId = 'ms-' + crypto.randomUUID().slice(0, 8);
      insertMs.run(msId, contractId, idx, m.description.trim(), Number(m.amount_eth));
    });

    // Record initialization event
    this.recordEvent(contractId, 'ContractCreated', buyer, `Initialized contract with ${milestones.length} milestones totaling ${totalAmount} ETH`);

    return this.getContractDetails(contractId);
  }

  getContractDetails(contractId) {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ? OR LOWER(contract_address) = ?').get(contractId, contractId.toLowerCase());
    if (!contract) return null;

    const milestones = db.prepare('SELECT * FROM milestones WHERE contract_id = ? ORDER BY milestone_index ASC').all(contract.id);
    const events = db.prepare('SELECT * FROM events WHERE contract_id = ? ORDER BY timestamp DESC').all(contract.id);

    const remainingLocked = Number((contract.total_amount_eth - contract.released_amount_eth).toFixed(4));

    return {
      ...contract,
      remaining_locked_eth: remainingLocked,
      milestones,
      events
    };
  }

  listContracts() {
    const contracts = db.prepare('SELECT * FROM contracts ORDER BY created_at DESC').all();
    return contracts.map(c => {
      const msCount = db.prepare('SELECT count(*) as count FROM milestones WHERE contract_id = ?').get(c.id).count;
      const completedMs = db.prepare('SELECT count(*) as count FROM milestones WHERE contract_id = ? AND is_released = 1').get(c.id).count;
      return {
        ...c,
        milestoneCount: msCount,
        completedMilestones: completedMs
      };
    });
  }

  depositFunds(contractId, callerAddress, amountEth) {
    const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
    if (!c) throw new Error('Contract not found.');
    if (c.state !== 'AWAITING_PAYMENT') throw new Error(`Cannot deposit funds in state "${c.state}".`);
    if (c.buyer_address.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new Error('Only the designated buyer address can deposit escrow funds.');
    }
    if (Number(amountEth) !== Number(c.total_amount_eth)) {
      throw new Error(`Deposit amount must exactly equal total agreement value of ${c.total_amount_eth} ETH.`);
    }

    db.prepare("UPDATE contracts SET state = 'FUNDED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(contractId);
    this.recordEvent(contractId, 'Deposited', callerAddress, `Buyer deposited full locked collateral of ${amountEth} ETH.`);

    return this.getContractDetails(contractId);
  }

  submitMilestone(contractId, milestoneId, callerAddress, evidenceUrl) {
    const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
    if (!c) throw new Error('Contract not found.');
    if (c.state !== 'FUNDED') throw new Error(`Cannot submit deliverables when escrow is in state "${c.state}".`);
    if (c.seller_address.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new Error('Only the designated seller address can submit deliverables.');
    }

    const ms = db.prepare('SELECT * FROM milestones WHERE id = ? AND contract_id = ?').get(milestoneId, contractId);
    if (!ms) throw new Error('Milestone not found.');
    if (ms.is_released) throw new Error('Milestone has already been released.');

    db.prepare(`
      UPDATE milestones
      SET is_submitted = 1, evidence_url = ?
      WHERE id = ?
    `).run(evidenceUrl || 'https://verified-artifacts.deliverable/proof', milestoneId);

    this.recordEvent(contractId, 'MilestoneSubmitted', callerAddress, `Seller submitted milestone #${ms.milestone_index + 1} deliverable.`);
    return this.getContractDetails(contractId);
  }

  releaseMilestone(contractId, milestoneId, callerAddress) {
    const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
    if (!c) throw new Error('Contract not found.');
    if (c.state !== 'FUNDED') throw new Error(`Cannot release milestone in state "${c.state}".`);
    if (c.buyer_address.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new Error('Only the designated buyer address can authorize milestone release.');
    }

    const ms = db.prepare('SELECT * FROM milestones WHERE id = ? AND contract_id = ?').get(milestoneId, contractId);
    if (!ms) throw new Error('Milestone not found.');
    if (ms.is_released) throw new Error('Milestone funds already disbursed.');

    // Approve and release milestone
    db.prepare(`
      UPDATE milestones
      SET is_approved = 1, is_released = 1
      WHERE id = ?
    `).run(milestoneId);

    const newReleased = Number((c.released_amount_eth + ms.amount_eth).toFixed(4));
    const allReleased = newReleased >= c.total_amount_eth;
    const nextState = allReleased ? 'COMPLETED' : 'FUNDED';

    db.prepare(`
      UPDATE contracts
      SET released_amount_eth = ?, state = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newReleased, nextState, contractId);

    this.recordEvent(contractId, 'MilestoneApproved', callerAddress, `Buyer released ${ms.amount_eth} ETH for milestone #${ms.milestone_index + 1}.`);

    if (allReleased) {
      this.recordEvent(contractId, 'EscrowCompleted', callerAddress, 'All milestones fulfilled. Escrow successfully completed.');
    }

    return this.getContractDetails(contractId);
  }

  raiseDispute(contractId, callerAddress, reason) {
    const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
    if (!c) throw new Error('Contract not found.');
    if (c.state !== 'FUNDED') throw new Error(`Cannot dispute contract in state "${c.state}".`);

    const callerNorm = callerAddress.toLowerCase();
    if (callerNorm !== c.buyer_address.toLowerCase() && callerNorm !== c.seller_address.toLowerCase()) {
      throw new Error('Only buyer or seller can raise a formal dispute.');
    }

    db.prepare(`
      UPDATE contracts
      SET state = 'DISPUTED', dispute_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, contractId);

    this.recordEvent(contractId, 'DisputeRaised', callerAddress, `Formal dispute raised: "${reason}"`);
    return this.getContractDetails(contractId);
  }

  resolveDispute(contractId, callerAddress, buyerRefundEth, sellerPayoutEth) {
    const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
    if (!c) throw new Error('Contract not found.');
    if (c.state !== 'DISPUTED') throw new Error(`Cannot arbitrate contract in state "${c.state}".`);
    if (c.arbitrator_address.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new Error('Only the designated arbitrator can resolve disputes.');
    }

    const remaining = Number((c.total_amount_eth - c.released_amount_eth).toFixed(4));
    const resolutionSum = Number((Number(buyerRefundEth) + Number(sellerPayoutEth)).toFixed(4));
    if (Math.abs(resolutionSum - remaining) > 0.0001) {
      throw new Error(`Resolution sum (${resolutionSum} ETH) must match remaining locked balance (${remaining} ETH).`);
    }

    const newReleased = Number((c.released_amount_eth + Number(sellerPayoutEth)).toFixed(4));
    db.prepare(`
      UPDATE contracts
      SET state = 'COMPLETED', released_amount_eth = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newReleased, contractId);

    this.recordEvent(contractId, 'DisputeResolved', callerAddress, `Arbitrator resolved: Refunded ${buyerRefundEth} ETH to buyer, paid ${sellerPayoutEth} ETH to contractor.`);
    return this.getContractDetails(contractId);
  }

  recordEvent(contractId, eventName, actor, details) {
    const evId = 'ev-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO events (id, contract_id, event_name, actor_address, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(evId, contractId, eventName, actor, details);
  }
}

export const escrowManager = new EscrowManager();

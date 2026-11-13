import express from 'express';
import { escrowManager } from '../engine/escrowManager.js';

export const router = express.Router();

// List Escrows
router.get('/escrows', (req, res) => {
  try {
    const list = escrowManager.listContracts();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Escrow
router.post('/escrows', (req, res) => {
  try {
    const contract = escrowManager.createContract(req.body);
    res.status(201).json(contract);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Escrow Details
router.get('/escrows/:id', (req, res) => {
  try {
    const details = escrowManager.getContractDetails(req.params.id);
    if (!details) return res.status(404).json({ error: 'Escrow contract not found.' });
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deposit Collateral
router.post('/escrows/:id/deposit', (req, res) => {
  const { caller_address, amount_eth } = req.body;
  if (!caller_address || amount_eth === undefined) {
    return res.status(400).json({ error: 'caller_address and amount_eth are required.' });
  }
  try {
    const updated = escrowManager.depositFunds(req.params.id, caller_address, amount_eth);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Submit Milestone
router.post('/escrows/:id/milestones/:msId/submit', (req, res) => {
  const { caller_address, evidence_url } = req.body;
  if (!caller_address) return res.status(400).json({ error: 'caller_address is required.' });

  try {
    const updated = escrowManager.submitMilestone(req.params.id, req.params.msId, caller_address, evidence_url);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Release Milestone
router.post('/escrows/:id/milestones/:msId/release', (req, res) => {
  const { caller_address } = req.body;
  if (!caller_address) return res.status(400).json({ error: 'caller_address is required.' });

  try {
    const updated = escrowManager.releaseMilestone(req.params.id, req.params.msId, caller_address);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Raise Dispute
router.post('/escrows/:id/dispute', (req, res) => {
  const { caller_address, reason } = req.body;
  if (!caller_address || !reason) {
    return res.status(400).json({ error: 'caller_address and reason are required.' });
  }

  try {
    const updated = escrowManager.raiseDispute(req.params.id, caller_address, reason);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Arbitrate Dispute
router.post('/escrows/:id/arbitrate', (req, res) => {
  const { caller_address, buyer_refund_eth, seller_payout_eth } = req.body;
  if (!caller_address || buyer_refund_eth === undefined || seller_payout_eth === undefined) {
    return res.status(400).json({ error: 'caller_address, buyer_refund_eth, seller_payout_eth required.' });
  }

  try {
    const updated = escrowManager.resolveDispute(req.params.id, caller_address, buyer_refund_eth, seller_payout_eth);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

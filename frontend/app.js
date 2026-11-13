// SecureEscrow FinTech Platform Client
const API_BASE = '/api/v1';

const ACTORS = {
  buyer: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
  seller: '0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e',
  arbitrator: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d'
};

let currentActorRole = 'buyer';
let activeContractId = null;
let currentContractData = null;

document.addEventListener('DOMContentLoaded', () => {
  setupUI();
  loadAgreements();
});

function setupUI() {
  const roleSelect = document.getElementById('roleSelector');
  roleSelect.addEventListener('change', (e) => {
    currentActorRole = e.target.value;
    if (activeContractId) loadContractDetails(activeContractId);
  });

  // New Agreement Modal
  const modalNew = document.getElementById('newEscrowModal');
  document.getElementById('btnNewEscrow').addEventListener('click', () => {
    document.getElementById('newSeller').value = ACTORS.seller;
    document.getElementById('newArbitrator').value = ACTORS.arbitrator;
    modalNew.classList.remove('hidden');
  });
  document.getElementById('btnCloseNewModal').addEventListener('click', () => modalNew.classList.add('hidden'));
  document.getElementById('btnCancelNew').addEventListener('click', () => modalNew.classList.add('hidden'));

  document.getElementById('createEscrowForm').addEventListener('submit', handleCreateEscrow);

  // Arbitrate Modal
  const modalArb = document.getElementById('arbitrateModal');
  document.getElementById('btnCloseArbitrateModal').addEventListener('click', () => modalArb.classList.add('hidden'));
  document.getElementById('btnCancelArbitrate').addEventListener('click', () => modalArb.classList.add('hidden'));
  document.getElementById('arbitrateForm').addEventListener('submit', handleArbitrateSubmit);
}

async function loadAgreements() {
  try {
    const res = await fetch(`${API_BASE}/escrows`);
    const agreements = await res.json();
    document.getElementById('agreementsCount').textContent = `${agreements.length} Total`;

    const list = document.getElementById('agreementsList');
    list.innerHTML = agreements.map(a => `
      <div class="agreement-item ${a.id === activeContractId ? 'active' : ''}" onclick="selectAgreement('${a.id}')">
        <div class="item-top">
          <span class="state-badge state-${a.state}">${a.state}</span>
          <strong style="font-family:var(--font-mono);font-size:0.85rem;">${a.total_amount_eth} ETH</strong>
        </div>
        <div class="item-title">${escapeHtml(a.title)}</div>
        <div class="item-sub">
          <span>${a.completedMilestones} of ${a.milestoneCount} Milestones</span>
          <span>${formatAddress(a.contract_address)}</span>
        </div>
      </div>
    `).join('');

    if (agreements.length > 0 && !activeContractId) {
      selectAgreement(agreements[0].id);
    }
  } catch (err) {
    console.error('Error fetching agreements:', err);
  }
}

window.selectAgreement = function(id) {
  activeContractId = id;
  loadContractDetails(id);
  loadAgreements();
};

async function loadContractDetails(id) {
  try {
    const res = await fetch(`${API_BASE}/escrows/${id}`);
    const c = await res.json();
    currentContractData = c;

    document.getElementById('emptyStateMsg').classList.add('hidden');
    document.getElementById('detailsCard').classList.remove('hidden');

    // Header info
    document.getElementById('stateBadge').className = `state-badge state-${c.state}`;
    document.getElementById('stateBadge').textContent = c.state;
    document.getElementById('contractAddressLabel').textContent = c.contract_address;
    document.getElementById('agreementTitle').textContent = c.title;

    document.getElementById('vaultRemainingVal').textContent = `${c.remaining_locked_eth} ETH`;
    document.getElementById('vaultReleasedSub').textContent = `${c.released_amount_eth} ETH Disbursed of ${c.total_amount_eth} ETH Total`;

    document.getElementById('buyerAddrLabel').textContent = formatAddress(c.buyer_address);
    document.getElementById('sellerAddrLabel').textContent = formatAddress(c.seller_address);
    document.getElementById('arbitratorAddrLabel').textContent = formatAddress(c.arbitrator_address);

    renderActionBanner(c);
    renderMilestones(c);
    renderAuditEvents(c.events);
  } catch (err) {
    console.error('Error fetching contract details:', err);
  }
}

function renderActionBanner(c) {
  const box = document.getElementById('actionAlertBox');
  const actorAddr = ACTORS[currentActorRole].toLowerCase();

  box.style.display = 'none';
  box.className = 'action-alert-box';

  if (c.state === 'AWAITING_PAYMENT') {
    box.style.display = 'flex';
    box.classList.add('alert-deposit');
    if (actorAddr === c.buyer_address.toLowerCase()) {
      box.innerHTML = `
        <div>
          <strong>Awaiting Collateral Deposit:</strong> As the buyer, deposit the required contract total (${c.total_amount_eth} ETH) to lock collateral in escrow.
        </div>
        <button class="btn btn-primary btn-sm" onclick="depositCollateral('${c.id}', ${c.total_amount_eth})">Deposit ${c.total_amount_eth} ETH</button>
      `;
    } else {
      box.innerHTML = `<div><strong>Awaiting Collateral:</strong> Waiting for buyer (${formatAddress(c.buyer_address)}) to deposit ${c.total_amount_eth} ETH into escrow contract.</div>`;
    }
  } else if (c.state === 'DISPUTED') {
    box.style.display = 'flex';
    box.classList.add('alert-dispute');
    if (actorAddr === c.arbitrator_address.toLowerCase()) {
      box.innerHTML = `
        <div>
          <strong>Active Dispute Under Arbitration:</strong> "${escapeHtml(c.dispute_reason)}". As designated arbitrator, issue the final split ruling.
        </div>
        <button class="btn btn-primary btn-sm" onclick="openArbitrateModal(${c.remaining_locked_eth})">Arbitrate Dispute</button>
      `;
    } else {
      box.innerHTML = `<div><strong>Active Dispute:</strong> "${escapeHtml(c.dispute_reason)}". Under formal review by designated arbitrator.</div>`;
    }
  } else if (c.state === 'FUNDED') {
    // Both buyer or seller can dispute
    box.style.display = 'flex';
    box.style.backgroundColor = '#f8fafc';
    box.style.border = '1px solid #e2e8f0';
    box.innerHTML = `
      <div style="font-size:0.85rem;color:#475569;">
        Escrow is fully funded and active. Deliverables are released on a milestone basis.
      </div>
      <button class="btn btn-outline btn-sm" style="color:#e11d48;border-color:#fecdd3;" onclick="promptDispute('${c.id}')">Raise Formal Dispute</button>
    `;
  }
}

function renderMilestones(c) {
  const container = document.getElementById('milestonesList');
  const actorAddr = ACTORS[currentActorRole].toLowerCase();
  const isBuyer = actorAddr === c.buyer_address.toLowerCase();
  const isSeller = actorAddr === c.seller_address.toLowerCase();

  container.innerHTML = c.milestones.map((m, idx) => {
    let actionBtn = '';

    if (c.state === 'FUNDED') {
      if (!m.is_submitted && isSeller) {
        actionBtn = `<button class="btn btn-sm btn-outline" onclick="submitMilestoneDeliverable('${c.id}', '${m.id}')">Submit Deliverable</button>`;
      } else if (m.is_submitted && !m.is_released && isBuyer) {
        actionBtn = `<button class="btn btn-sm btn-primary" onclick="releaseMilestoneFunds('${c.id}', '${m.id}', ${m.amount_eth})">Release ${m.amount_eth} ETH</button>`;
      }
    }

    let statusPill = '<span class="state-badge" style="background:#f1f5f9;color:#64748b;">Pending</span>';
    if (m.is_released) {
      statusPill = '<span class="state-badge state-FUNDED">Released</span>';
    } else if (m.is_submitted) {
      statusPill = '<span class="state-badge state-AWAITING_PAYMENT">Submitted</span>';
    }

    let evidenceLink = m.evidence_url
      ? `<a href="${escapeHtml(m.evidence_url)}" target="_blank" style="color:#2563eb;text-decoration:none;">View Proof &rarr;</a>`
      : 'No deliverable submitted yet';

    return `
      <div class="ms-card">
        <div class="ms-main">
          <div class="ms-number ${m.is_released ? 'completed' : ''}">${idx + 1}</div>
          <div>
            <div class="ms-desc">${escapeHtml(m.description)}</div>
            <div class="ms-meta">${statusPill} &middot; Evidence: ${evidenceLink}</div>
          </div>
        </div>
        <div class="ms-actions">
          <span class="ms-val">${m.amount_eth} ETH</span>
          ${actionBtn}
        </div>
      </div>
    `;
  }).join('');
}

function renderAuditEvents(events) {
  const container = document.getElementById('auditLog');
  if (!events || events.length === 0) {
    container.innerHTML = '<p style="color:#64748b;font-size:0.85rem;">No on-chain events recorded.</p>';
    return;
  }

  container.innerHTML = events.map(ev => `
    <div class="ev-item">
      <div>
        <span class="ev-name">${escapeHtml(ev.event_name)}</span>
        <span>${escapeHtml(ev.details)}</span>
      </div>
      <span class="ev-time">${new Date(ev.timestamp).toLocaleTimeString()}</span>
    </div>
  `).join('');
}

// User Actions
window.depositCollateral = async function(id, amount) {
  try {
    const res = await fetch(`${API_BASE}/escrows/${id}/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caller_address: ACTORS[currentActorRole],
        amount_eth: amount
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Deposit failed');
    loadAgreements();
    loadContractDetails(id);
  } catch (err) {
    alert(err.message);
  }
};

window.submitMilestoneDeliverable = async function(contractId, msId) {
  const proofUrl = prompt('Enter deliverable artifact URL or commit hash (e.g. GitHub tag/commit):', 'https://github.com/vanguard/specs/releases/tag/v1.1');
  if (!proofUrl) return;

  try {
    const res = await fetch(`${API_BASE}/escrows/${contractId}/milestones/${msId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caller_address: ACTORS[currentActorRole],
        evidence_url: proofUrl
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed');
    loadAgreements();
    loadContractDetails(contractId);
  } catch (err) {
    alert(err.message);
  }
};

window.releaseMilestoneFunds = async function(contractId, msId, amount) {
  if (confirm(`Authorize release of ${amount} ETH directly to contractor for completed milestone?`)) {
    try {
      const res = await fetch(`${API_BASE}/escrows/${contractId}/milestones/${msId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller_address: ACTORS[currentActorRole]
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Release failed');
      loadAgreements();
      loadContractDetails(contractId);
    } catch (err) {
      alert(err.message);
    }
  }
};

window.promptDispute = async function(contractId) {
  const reason = prompt('Specify formal dispute grounds for arbitrator review:');
  if (!reason) return;

  try {
    const res = await fetch(`${API_BASE}/escrows/${contractId}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caller_address: ACTORS[currentActorRole],
        reason
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Dispute failed');
    loadAgreements();
    loadContractDetails(contractId);
  } catch (err) {
    alert(err.message);
  }
};

window.openArbitrateModal = function(remaining) {
  document.getElementById('arbTotalRemaining').value = `${remaining} ETH`;
  document.getElementById('arbBuyerRefund').value = (remaining / 2).toFixed(2);
  document.getElementById('arbSellerPayout').value = (remaining / 2).toFixed(2);
  document.getElementById('arbitrateModal').classList.remove('hidden');
};

async function handleArbitrateSubmit(e) {
  e.preventDefault();
  const buyerRefund = parseFloat(document.getElementById('arbBuyerRefund').value);
  const sellerPayout = parseFloat(document.getElementById('arbSellerPayout').value);

  try {
    const res = await fetch(`${API_BASE}/escrows/${activeContractId}/arbitrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caller_address: ACTORS[currentActorRole],
        buyer_refund_eth: buyerRefund,
        seller_payout_eth: sellerPayout
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Arbitration ruling failed');

    document.getElementById('arbitrateModal').classList.add('hidden');
    loadAgreements();
    loadContractDetails(activeContractId);
  } catch (err) {
    alert(err.message);
  }
}

async function handleCreateEscrow(e) {
  e.preventDefault();
  const title = document.getElementById('newTitle').value.trim();
  const seller = document.getElementById('newSeller').value.trim();
  const arbitrator = document.getElementById('newArbitrator').value.trim();

  const descEls = document.querySelectorAll('.ms-desc');
  const amtEls = document.querySelectorAll('.ms-amt');

  const milestones = [];
  for (let i = 0; i < descEls.length; i++) {
    milestones.push({
      description: descEls[i].value.trim(),
      amount_eth: parseFloat(amtEls[i].value)
    });
  }

  try {
    const res = await fetch(`${API_BASE}/escrows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        buyer: ACTORS.buyer,
        seller,
        arbitrator,
        milestones
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to initialize escrow');

    document.getElementById('createEscrowForm').reset();
    document.getElementById('newEscrowModal').classList.add('hidden');
    loadAgreements();
    selectAgreement(data.id);
  } catch (err) {
    alert(err.message);
  }
}

function formatAddress(addr) {
  if (!addr) return '0x0';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

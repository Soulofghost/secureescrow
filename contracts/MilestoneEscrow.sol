// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MilestoneEscrow
 * @dev Multi-milestone escrow contract with independent arbitration and reentrancy protection.
 * Authored for enterprise cross-border contractor deliverables.
 */
contract MilestoneEscrow {
    enum EscrowState {
        AWAITING_PAYMENT,
        FUNDED,
        DISPUTED,
        COMPLETED,
        REFUNDED
    }

    struct Milestone {
        uint256 id;
        string description;
        uint256 amount;
        bool isSubmitted;
        bool isApproved;
        bool isReleased;
        string evidenceUrl;
    }

    address public immutable buyer;
    address public immutable seller;
    address public immutable arbitrator;

    uint256 public totalAmount;
    uint256 public totalReleased;
    EscrowState public state;

    Milestone[] public milestones;
    string public disputeReason;

    // Reentrancy lock
    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    event Deposited(address indexed buyer, uint256 amount);
    event MilestoneSubmitted(uint256 indexed milestoneId, string evidenceUrl);
    event MilestoneApproved(uint256 indexed milestoneId, uint256 amount);
    event DisputeRaised(address indexed raisedBy, string reason);
    event DisputeResolved(uint256 buyerRefund, uint256 sellerPayout);
    event EscrowCompleted();

    modifier onlyBuyer() {
        require(msg.sender == buyer, "Unauthorized: Caller is not buyer");
        _;
    }

    modifier onlySeller() {
        require(msg.sender == seller, "Unauthorized: Caller is not seller");
        _;
    }

    modifier onlyArbitrator() {
        require(msg.sender == arbitrator, "Unauthorized: Caller is not arbitrator");
        _;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    constructor(
        address _seller,
        address _arbitrator,
        string[] memory _descriptions,
        uint256[] memory _amounts
    ) {
        require(_seller != address(0) && _arbitrator != address(0), "Invalid participant address");
        require(_descriptions.length == _amounts.length, "Milestone counts mismatch");
        require(_descriptions.length > 0, "At least one milestone required");

        buyer = msg.sender;
        seller = _seller;
        arbitrator = _arbitrator;
        _status = _NOT_ENTERED;

        uint256 sum = 0;
        for (uint256 i = 0; i < _descriptions.length; i++) {
            require(_amounts[i] > 0, "Milestone amount must be positive");
            milestones.push(Milestone({
                id: i,
                description: _descriptions[i],
                amount: _amounts[i],
                isSubmitted: false,
                isApproved: false,
                isReleased: false,
                evidenceUrl: ""
            }));
            sum += _amounts[i];
        }

        totalAmount = sum;
        state = EscrowState.AWAITING_PAYMENT;
    }

    function deposit() external payable onlyBuyer nonReentrant {
        require(state == EscrowState.AWAITING_PAYMENT, "Escrow already funded or resolved");
        require(msg.value == totalAmount, "Exact deposit amount required");

        state = EscrowState.FUNDED;
        emit Deposited(buyer, msg.value);
    }

    function submitMilestone(uint256 milestoneId, string calldata evidenceUrl) external onlySeller {
        require(state == EscrowState.FUNDED, "Escrow is not active");
        require(milestoneId < milestones.length, "Invalid milestone index");
        Milestone storage m = milestones[milestoneId];
        require(!m.isReleased, "Milestone already released");

        m.isSubmitted = true;
        m.evidenceUrl = evidenceUrl;
        emit MilestoneSubmitted(milestoneId, evidenceUrl);
    }

    function releaseMilestone(uint256 milestoneId) external onlyBuyer nonReentrant {
        require(state == EscrowState.FUNDED, "Escrow is not active");
        require(milestoneId < milestones.length, "Invalid milestone index");
        Milestone storage m = milestones[milestoneId];
        require(!m.isReleased, "Milestone already released");

        m.isApproved = true;
        m.isReleased = true;
        totalReleased += m.amount;

        (bool success, ) = seller.call{value: m.amount}("");
        require(success, "ETH transfer to seller failed");

        emit MilestoneApproved(milestoneId, m.amount);

        if (totalReleased == totalAmount) {
            state = EscrowState.COMPLETED;
            emit EscrowCompleted();
        }
    }

    function raiseDispute(string calldata reason) external {
        require(msg.sender == buyer || msg.sender == seller, "Only buyer or seller can dispute");
        require(state == EscrowState.FUNDED, "Escrow is not in active state");

        state = EscrowState.DISPUTED;
        disputeReason = reason;
        emit DisputeRaised(msg.sender, reason);
    }

    function resolveDispute(
        uint256 buyerRefundAmount,
        uint256 sellerPayoutAmount
    ) external onlyArbitrator nonReentrant {
        require(state == EscrowState.DISPUTED, "Escrow is not in disputed state");
        uint256 remainingBalance = address(this).balance;
        require(buyerRefundAmount + sellerPayoutAmount == remainingBalance, "Resolution amounts must equal contract balance");

        state = EscrowState.COMPLETED;

        if (buyerRefundAmount > 0) {
            (bool bSuccess, ) = buyer.call{value: buyerRefundAmount}("");
            require(bSuccess, "Refund transfer to buyer failed");
        }

        if (sellerPayoutAmount > 0) {
            (bool sSuccess, ) = seller.call{value: sellerPayoutAmount}("");
            require(sSuccess, "Payout transfer to seller failed");
        }

        emit DisputeResolved(buyerRefundAmount, sellerPayoutAmount);
    }

    function getMilestonesCount() external view returns (uint256) {
        return milestones.length;
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}

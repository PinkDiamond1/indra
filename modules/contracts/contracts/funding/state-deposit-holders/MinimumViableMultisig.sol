pragma solidity 0.5.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/cryptography/ECDSA.sol";

/// @title MinimumViableMultisig - A multisig wallet supporting the minimum
/// features required for state channels support
/// @author Liam Horne - <liam@l4v.io>
/// @notice
/// (a) Executes arbitrary transactions using `CALL` or `DELEGATECALL`
/// (b) Requires n-of-n unanimous consent
/// (c) Does not use on-chain address for signature verification
/// (d) Uses hash-based instead of nonce-based replay protection (update: nonce added)
contract MinimumViableMultisig {
    using ECDSA for bytes32;

    address masterCopy;

    mapping(bytes32 => bool) isExecuted;

    address[] private _owners;

    enum Operation {Call, DelegateCall}

    function() external payable {}

    /// @notice Contract constructor
    /// @param owners An array of unique addresses representing the multisig owners
    function setup(address[] memory owners) public {
        require(_owners.length == 0, "Contract has been set up before");
        _owners = owners;
    }

    /// @notice Execute an n-of-n signed transaction specified by a (to, value, data, op) tuple
    /// This transaction is a message call, i.e., either a CALL or a DELEGATECALL,
    /// depending on the value of `op`. The arguments `to`, `value`, `data` are passed
    /// as arguments to the CALL/DELEGATECALL.
    /// @param to The destination address of the message call
    /// @param value The amount of ETH being forwarded in the message call
    /// @param data Any calldata being sent along with the message call
    /// @param operation Specifies whether the message call is a `CALL` or a `DELEGATECALL`
    /// @param domainName EIP712-defined hash to determine context (https://eips.ethereum.org/EIPS/eip-712)
    /// @param domainName EIP712-defined hash to determine context (https://eips.ethereum.org/EIPS/eip-712)
    /// @param domainVersion EIP712-defined hash to determine context (https://eips.ethereum.org/EIPS/eip-712)
    /// @param chainId EIP712-defined hash to determine context (https://eips.ethereum.org/EIPS/eip-712)
    /// @param domainSalt EIP712-defined hash to determine context (https://eips.ethereum.org/EIPS/eip-712)
    /// @param nonce Replay protection
    /// @param signatures A sorted bytes string of concatenated signatures of each owner
    function execTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Operation operation,
        string memory domainName,
        string memory domainVersion,
        uint256 chainId,
        bytes32 domainSalt,
        uint256 nonce,
        bytes[] memory signatures
    ) public {
        bytes32 domainSeparatorHash = getDomainSeparatorHash(
            domainName,
            domainVersion,
            chainId,
            domainSalt
        );
        bytes32 transactionHash = getTransactionHash(
            to,
            value,
            data,
            operation,
            domainSeparatorHash,
            nonce
        );

        require(!isExecuted[transactionHash], "Transacation has already been executed");

        isExecuted[transactionHash] = true;

        address lastSigner = address(0);
        for (uint256 i = 0; i < _owners.length; i++) {
            require(_owners[i] == transactionHash.recover(signatures[i]), "Invalid signature");
            require(_owners[i] > lastSigner, "Signers not in alphanumeric order");
            lastSigner = _owners[i];
        }

        execute(to, value, data, operation);
    }

    /// @notice Compute a unique transaction hash for a particular (to, value, data, op) tuple
    /// @return A unique hash that owners are expected to sign and submit to
    /// @notice `data` is hashed before encoding to avoid possibility of collisions with encodePacked. See
    /// https://gist.github.com/HeikoFisch/fec0a20eaa8ca02688839ca7108930ba#a3-unsafe-use-of-packed-encoding-m
    function getTransactionHash(
        address to,
        uint256 value,
        bytes memory data,
        Operation operation,
        bytes32 domainSeparatorHash,
        uint256 nonce
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    bytes1(0x19),
                    _owners,
                    to,
                    value,
                    keccak256(abi.encodePacked(data)),
                    uint8(operation),
                    domainSeparatorHash,
                    nonce
                )
            );
    }

    /// @notice Compute a domain separator hash to allow transactions to differ across domains (i.e. chainId)
    /// @return A unique hash that is included in the transaction hash
    /// @notice `domainName` and `domainVersion` are hashed before encoding to avoid possibility of collisions with encodePacked.
    /// See https://gist.github.com/HeikoFisch/fec0a20eaa8ca02688839ca7108930ba#a3-unsafe-use-of-packed-encoding-m
    function getDomainSeparatorHash(
        string memory domainName,
        string memory domainVersion,
        uint256 chainId,
        bytes32 domainSalt
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    keccak256(abi.encodePacked(domainName)),
                    keccak256(abi.encodePacked(domainVersion)),
                    chainId,
                    address(this),
                    domainSalt
                )
            );
    }

    /// @notice A getter function for the owners of the multisig
    /// @return An array of addresses representing the owners
    function getOwners() public view returns (address[] memory) {
        return _owners;
    }

    /// @notice Execute a transaction on behalf of the multisignature wallet
    function execute(address to, uint256 value, bytes memory data, Operation operation) internal {
        if (operation == Operation.Call)
            require(executeCall(to, value, data), "executeCall failed");
        else if (operation == Operation.DelegateCall)
            require(executeDelegateCall(to, data), "executeDelegateCall failed");
    }

    /// @notice Execute a CALL on behalf of the multisignature wallet
    /// @return A boolean indicating if the transaction was successful or not
    function executeCall(address to, uint256 value, bytes memory data)
        internal
        returns (bool success)
    {
        assembly {
            success := call(not(0), to, value, add(data, 0x20), mload(data), 0, 0)
        }
    }

    /// @notice Execute a DELEGATECALL on behalf of the multisignature wallet
    /// @return A boolean indicating if the transaction was successful or not
    function executeDelegateCall(address to, bytes memory data) internal returns (bool success) {
        assembly {
            success := delegatecall(not(0), to, add(data, 0x20), mload(data), 0, 0)
        }
    }

}

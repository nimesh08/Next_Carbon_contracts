// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title RetirementCertificate - ERC-721 NFT issued atomically when VCC is burned
contract RetirementCertificate is ERC721, ERC721URIStorage, Ownable {
    struct Certificate {
        uint256 amount;
        string projectId;
        uint256 timestamp;
        address retiree;
    }

    mapping(uint256 => Certificate) public certificates;
    uint256 public nextTokenId = 1;

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed retiree,
        string projectId,
        uint256 amount
    );

    constructor() ERC721("Carbon Retirement Certificate", "CRC") Ownable(msg.sender) {}

    function mint(
        address _to,
        uint256 _amount,
        string calldata _projectId,
        string calldata _tokenURI
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = nextTokenId++;

        certificates[tokenId] = Certificate({
            amount: _amount,
            projectId: _projectId,
            timestamp: block.timestamp,
            retiree: _to
        });

        _safeMint(_to, tokenId);
        _setTokenURI(tokenId, _tokenURI);

        emit CertificateMinted(tokenId, _to, _projectId, _amount);
        return tokenId;
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

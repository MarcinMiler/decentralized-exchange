//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

import "./DexERC20.sol";
import "./library/Math.sol";

contract DexPair is DexERC20 {
  using SafeMath for uint;

  uint public constant MINIMUM_LIQUIDITY = 10 ** 3;
  bytes4 private constant SELECTOR = bytes4(keccak256(bytes("transfer(address,uint256)")));

  address public immutable factory;
  address public token0;
  address public token1;

  uint256 public reserve0;
  uint256 public reserve1;

  event Mint(address indexed sender, uint amount0, uint amount1);
  event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);
  event Sync(uint reserve0, uint reserve1);

  constructor() {
    factory = msg.sender;
  }

  function initialize(address _token0 , address _token1) external {
    require(msg.sender == factory, "FORBIDDEN");
    token0 = _token0;
    token1 = _token1;
  }

  function getReserves() public view returns (uint _reserve0, uint _reserve1) {
    _reserve0 = reserve0;
    _reserve1 = reserve1;
  }

  function _safeTransfer(address token, address to, uint value) private {
    (bool success, bytes memory data) = token.call(abi.encodeWithSelector(SELECTOR, to, value));
    require(success && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
  }

  function _update(uint balance0, uint balance1) private {
    reserve0 = balance0;
    reserve1 = balance1;

    emit Sync(reserve0, reserve1);
  }

  function mint(address to) external returns (uint liquidity) {
    (uint _reserve0, uint _reserve1) = getReserves();

    uint balance0 = IERC20(token0).balanceOf(address(this));
    uint balance1 = IERC20(token1).balanceOf(address(this));

    uint amount0 = balance0.sub(_reserve0);
    uint amount1 = balance1.sub(_reserve1);

    if (totalSupply == 0) {
      liquidity = Math.sqrt(amount0.mul(amount1)).sub(MINIMUM_LIQUIDITY);
      _mint(address(0), MINIMUM_LIQUIDITY);
    } else {
      liquidity = Math.min(amount0.mul(totalSupply) / _reserve0, amount1.mul(totalSupply) / _reserve1);
    }

    require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");

    _mint(to, liquidity);
    _update(balance0, balance1);

    emit Mint(msg.sender, amount0, amount1);
  }

  function burn(address to) external returns (uint amount0, uint amount1) {
    // (uint _reserve0, uint _reserve1) = getReserves();
    address _token0 = token0;
    address _token1 = token1;
    uint _totalSupply = totalSupply;

    uint balance0 = IERC20(_token0).balanceOf(address(this));
    uint balance1 = IERC20(_token1).balanceOf(address(this));
    uint liquidity = balanceOf[address(this)];

    amount0 = liquidity.mul(balance0) / _totalSupply;
    amount1 = liquidity.mul(balance1) / _totalSupply;

    require(amount0 > 0 && amount1 > 0, "INSUFFICIENT_LIQUIDITY_BURNED");

    _burn(address(this), liquidity);
    _safeTransfer(token0, to, amount0);
    _safeTransfer(token1, to, amount1);

    balance0 = IERC20(_token0).balanceOf(address(this));
    balance1 = IERC20(_token1).balanceOf(address(this));
    _update(balance0, balance1);

    emit Burn(msg.sender, amount0, amount1, to);
  }

  function swap(
    uint amount0,
    uint amount1,
    address to
  ) external {
    require(amount0 > 0 || amount1 > 0, "INSUFFICIENT_OUTPUT_AMOUNT");

    (uint _reserve0, uint _reserve1) = getReserves();

    require(amount0 < _reserve0 && amount1 < _reserve1, "INSUFFICIENT_LIQUIDITY");

    require(to != token0 && to != token1, "INVALID_TO");

    if (amount0 > 0) _safeTransfer(token0, to, amount0);
    if (amount1 > 0) _safeTransfer(token1, to, amount1);

    uint balance0 = IERC20(token0).balanceOf(address(this));
    uint balance1 = IERC20(token1).balanceOf(address(this));

    // console.log("Amount %s %s", amount0, amount1);
    // console.log("Balance %s %s", balance0, balance1);

    _update(balance0, balance1);
  }
}
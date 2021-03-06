/* global describe it before ethers */
const { expect } = require('chai')
const { BigNumber } = require('ethers')
const truffleAssert = require('truffle-assertions')
// const { idText } = require('typescript')

// eslint-disable-next-line no-unused-vars
// const { expect } = require('chai')

// import ERC721 from '../artifacts/ERC721.json'
// import { ethers } from 'ethers'

// const { deployProject } = require('../scripts/deploy-ganache.js')

const { deployProject } = require('../scripts/deploy.js')
const { wearableTypes } = require('../scripts/wearableTypes.js')

// numBytes is how many bytes of the uint that we care about
function uintToIntArray(uint, numBytes) {
  uint = ethers.utils.hexZeroPad(uint.toHexString(), numBytes).slice(2)
  const array = []
  for (let i = 0; i < uint.length; i += 2) {
    array.unshift(ethers.BigNumber.from('0x' + uint.substr(i, 2)).fromTwos(8).toNumber())
  }
  return array
}

function uintToWearableIds(uint) {
  uint = ethers.utils.hexZeroPad(uint.toHexString(), 32).slice(2)
  const array = []
  for (let i = 0; i < uint.length; i += 4) {
    array.unshift(ethers.BigNumber.from('0x' + uint.substr(i, 4)).fromTwos(16).toNumber())
  }
  return array
}

const testAavegotchiId = '0'
const testWearableId = '1'
const testSlot = '3'

describe('Deploying Contracts, SVG and Minting Aavegotchis', async function () {
  before(async function () {
    const deployVars = await deployProject()
    global.set = true
    global.account = deployVars.account
    global.aavegotchiDiamond = deployVars.aavegotchiDiamond
    global.aavegotchiFacet = deployVars.aavegotchiFacet
    global.wearablesFacet = deployVars.wearablesFacet
    global.collateralFacet = deployVars.collateralFacet
    global.escrowFacet = deployVars.escrowFacet
    global.shopFacet = deployVars.shopFacet
    global.ghstDiamond = deployVars.ghstDiamond
    global.vrfFacet = deployVars.vrfFacet
    global.linkAddress = deployVars.linkAddress
    global.linkContract = deployVars.linkContract
    global.vouchersContract = deployVars.vouchersContract
    global.diamondLoupeFacet = deployVars.diamondLoupeFacet
  })
  it('Should mint 10,000,000 GHST tokens', async function () {
    await global.ghstDiamond.mint()
    const balance = await global.ghstDiamond.balanceOf(global.account)
    const oneMillion = ethers.utils.parseEther('10000000')
    expect(balance).to.equal(oneMillion)
  })
})

describe('Buying Portals, VRF', function () {
  it('Should not fire VRF if there are no portals in batch', async function () {
    await truffleAssert.reverts(vrfFacet.drawRandomNumber(), "VrfFacet: Can't call VRF with none in batch")
  })

  it('Portal should cost 100 GHST', async function () {
    const balance = await ghstDiamond.balanceOf(account)
    await ghstDiamond.approve(aavegotchiDiamond.address, balance)
    const buyAmount = (50 * Math.pow(10, 18)).toFixed() // 1 portal
    await truffleAssert.reverts(aavegotchiFacet.buyPortals(account, buyAmount, true), 'AavegotchiFacet: Not enough GHST to buy portal')
  })

  it('Should purchase one portal', async function () {
    const balance = await ghstDiamond.balanceOf(account)
    await ghstDiamond.approve(aavegotchiDiamond.address, balance)
    const buyAmount = (100 * Math.pow(10, 18)).toFixed() // 1 portal
    await global.aavegotchiFacet.buyPortals(account, buyAmount, true)

    const myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    expect(myPortals.length).to.equal(1)
  })

  it('Batch count should be 1', async function () {
    const vrfInfo = await global.vrfFacet.vrfInfo()
    expect(vrfInfo.batchCount_).to.equal(1)
  })

  it('Should allow opting out of VRF batch', async function () {
    const balance = await ghstDiamond.balanceOf(account)
    await ghstDiamond.approve(aavegotchiDiamond.address, balance)
    const buyAmount = (100 * Math.pow(10, 18)).toFixed() // 1 portal
    await global.aavegotchiFacet.buyPortals(account, buyAmount, false)
  })

  // it('Only owner can set batch id', async function () {
  //  await bobAavegotchi.setBatchId(["0"])
  // })

  it('Should opt into next batch', async function () {
    await truffleAssert.reverts(aavegotchiFacet.setBatchId(['0']), 'AavegotchiFacet: batchId already set')
    await global.aavegotchiFacet.setBatchId(['1'])

    const vrfInfo = await global.vrfFacet.vrfInfo()
    expect(vrfInfo.batchCount_).to.equal(2)
  })

  it('Cannot open portal without first calling VRF', async function () {
    await truffleAssert.reverts(aavegotchiFacet.openPortals(['0']), 'AavegotchiFacet: No random number for this portal')
  })

  it('Should receive VRF call', async function () {
    await global.vrfFacet.drawRandomNumber()
    const randomness = ethers.utils.keccak256(new Date().getMilliseconds())
    await global.vrfFacet.rawFulfillRandomness(ethers.constants.HashZero, randomness)
  })

  it('Should reset batch to 0 after calling VRF', async function () {
    await truffleAssert.reverts(vrfFacet.drawRandomNumber(), "VrfFacet: Can't call VRF with none in batch")
    const vrfInfo = await global.vrfFacet.vrfInfo()
    expect(vrfInfo.batchCount_).to.equal(0)
  })

  it('Should wait 18 hours before next VRF call', async function () {
    const balance = await ghstDiamond.balanceOf(account)
    await ghstDiamond.approve(aavegotchiDiamond.address, balance)
    const buyAmount = (100 * Math.pow(10, 18)).toFixed() // 1 portal
    await global.aavegotchiFacet.buyPortals(account, buyAmount, true)
    await truffleAssert.reverts(vrfFacet.drawRandomNumber(), 'VrfFacet: Waiting period to call VRF not over yet')

    ethers.provider.send('evm_increaseTime', [18 * 3600])
    ethers.provider.send('evm_mine')
    await global.vrfFacet.drawRandomNumber()

    const randomness = ethers.utils.keccak256(new Date().getMilliseconds())
    await global.vrfFacet.rawFulfillRandomness(ethers.constants.HashZero, randomness)
    const vrfInfo = await global.vrfFacet.vrfInfo()
    expect(vrfInfo.batchCount_).to.equal(0)
  })

  it('Cannot call VRF before it is ready', async function () {
    const balance = await ghstDiamond.balanceOf(account)
    await ghstDiamond.approve(aavegotchiDiamond.address, balance)
    const buyAmount = (100 * Math.pow(10, 18)).toFixed() // 1 portal
    await global.aavegotchiFacet.buyPortals(account, buyAmount, true)
    await truffleAssert.reverts(vrfFacet.drawRandomNumber(), 'VrfFacet: Waiting period to call VRF not over yet')
  })
})

describe('Opening Portals', async function () {
  it('Should open the portal', async function () {
    let myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    expect(myPortals[0].status).to.equal(0)
    const portalId = myPortals[0].tokenId
    await global.aavegotchiFacet.openPortals([portalId])
    myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    expect(myPortals[0].status).to.equal(1)
  })

  it('Should contain 10 random ghosts in the portal', async function () {
    const myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    const ghosts = await global.aavegotchiFacet.portalAavegotchiTraits(myPortals[0].tokenId)
    // console.log(JSON.stringify(ghosts, null, 4))
    ghosts.forEach(async (ghost) => {
      const rarityScore = await global.aavegotchiFacet.calculateBaseRarityScore(ghost.numericTraits, ghost.collateralType)
      expect(Number(rarityScore)).to.greaterThan(298)
      expect(Number(rarityScore)).to.lessThan(602)
    })
    expect(ghosts.length).to.equal(10)
  })

  /*
  it('Should show SVGs', async function () {
    const myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    const tokenId = myPortals[0].tokenId
    const svgs = await global.aavegotchiFacet.portalAavegotchisSvg(tokenId)
    // console.log('svgs:', svgs[0])
    expect(svgs.length).to.equal(10)
  })
  */

  it('Should claim an Aavegotchi', async function () {
    const myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    //  console.log('my portals:', myPortals)
    const tokenId = myPortals[0].tokenId
    const ghosts = await global.aavegotchiFacet.portalAavegotchiTraits(tokenId)
    const selectedGhost = ghosts[4]
    const minStake = selectedGhost.minimumStake
    await global.aavegotchiFacet.claimAavegotchiFromPortal(tokenId, 4, minStake)

    const aavegotchi = await global.aavegotchiFacet.getAavegotchi(tokenId)

    const collateral = aavegotchi.collateral
    expect(selectedGhost.collateralType).to.equal(collateral)
    expect(aavegotchi.status).to.equal(2)
    expect(aavegotchi.hauntId).to.equal(0)
    expect(aavegotchi.stakedAmount).to.equal(minStake)
  })
})

describe('Aavegotchi Metadata', async function () {
  it('Should set a name', async function () {
    const myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    const tokenId = myPortals[0].tokenId
    await truffleAssert.reverts(aavegotchiFacet.setAavegotchiName(tokenId, 'ThisIsLongerThan25CharsSoItWillRevert'), "AavegotchiFacet: _name can't be greater than 25 characters")
    await global.aavegotchiFacet.setAavegotchiName(tokenId, 'Beavis')
    const aavegotchi = await global.aavegotchiFacet.getAavegotchi(tokenId)
    expect(aavegotchi.name).to.equal('Beavis')
  })

  it('Can only set name on claimed Aavegotchi', async function () {
    await truffleAssert.reverts(aavegotchiFacet.setAavegotchiName('1', 'Portal'), 'AavegotchiFacet: Must choose Aavegotchi before setting name')
  })

  it('Should show correct rarity score', async function () {
    const myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    const tokenId = myPortals[0].tokenId
    const aavegotchi = await global.aavegotchiFacet.getAavegotchi(tokenId)
    const score = await global.aavegotchiFacet.calculateBaseRarityScore([0, 0, 0, 0, 0, 0], aavegotchi.collateral)
    expect(score).to.equal(599)

    const multiplier = await global.aavegotchiFacet.calculateRarityMultiplier([0, 0, 0, 0, 0, 0], aavegotchi.collateral)
    expect(multiplier).to.equal(1000)

    // Todo: Clientside calculate what the rarity score should be
  })
})

describe('Collaterals and escrow', async function () {
  it('Should show all whitelisted collaterals', async function () {
    const collaterals = await global.collateralFacet.getCollateralInfo()
    const collateral = collaterals[0]
    expect(collateral.conversionRate).to.equal(500)
    expect(collaterals.length).to.equal(7)
    const modifiers = uintToIntArray(collateral.modifiers, 6)
    expect(modifiers[2]).to.equal(-1)
  })

  it('Can increase stake', async function () {
    let aavegotchi = await global.aavegotchiFacet.getAavegotchi('0')
    const currentStake = BigNumber.from(aavegotchi.stakedAmount)

    // Let's double the stake
    await global.escrowFacet.increaseStake('0', currentStake.toString())
    aavegotchi = await global.aavegotchiFacet.getAavegotchi('0')
    const finalStake = BigNumber.from(aavegotchi.stakedAmount)
    expect(finalStake).to.equal(currentStake.add(currentStake))

    // Todo: Balance check
  })

  it('Can decrease stake, but not below minimum', async function () {
    let aavegotchi = await global.aavegotchiFacet.getAavegotchi(testAavegotchiId)
    let currentStake = BigNumber.from(aavegotchi.stakedAmount)
    const minimumStake = BigNumber.from(aavegotchi.minimumStake)

    const available = currentStake.sub(minimumStake)
    await truffleAssert.reverts(escrowFacet.decreaseStake(testAavegotchiId, currentStake), 'EscrowFacet: Cannot reduce below minimum stake')
    await global.escrowFacet.decreaseStake(testAavegotchiId, available)

    aavegotchi = await global.aavegotchiFacet.getAavegotchi(testAavegotchiId)
    currentStake = BigNumber.from(aavegotchi.stakedAmount)
    expect(currentStake).to.equal(minimumStake)
  })

  it('Contract Owner (Later DAO) can update collateral modifiers', async function () {
    const aavegotchi = await global.aavegotchiFacet.getAavegotchi('0')
    let score = await global.aavegotchiFacet.calculateBaseRarityScore([0, 0, 0, 0, 0, 0], aavegotchi.collateral)
    expect(score).to.equal(599)
    await global.collateralFacet.updateCollateralModifiers(aavegotchi.collateral, [2, 0, 0, 0, 0, 0])
    score = await global.aavegotchiFacet.calculateBaseRarityScore([0, 0, 0, 0, 0, 0], aavegotchi.collateral)
    expect(score).to.equal(602)
  })

  it('Can decrease stake and destroy Aavegotchi', async function () {
    // Buy portal
    const buyAmount = (100 * Math.pow(10, 18)).toFixed() // 1 portal
    await global.aavegotchiFacet.buyPortals(account, buyAmount, true)
    ethers.provider.send('evm_increaseTime', [18 * 3600])
    ethers.provider.send('evm_mine')

    // Call VRF
    await global.vrfFacet.drawRandomNumber()
    const randomness = ethers.utils.keccak256(new Date().getMilliseconds())
    await global.vrfFacet.rawFulfillRandomness(ethers.constants.HashZero, randomness)

    let myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    expect(myPortals.length).to.equal(5)
    // Open portal
    await global.aavegotchiFacet.openPortals(['1'])
    const ghosts = await global.aavegotchiFacet.portalAavegotchiTraits('1')
    const selectedGhost = ghosts[0]
    const minStake = selectedGhost.minimumStake
    const initialBalance = BigNumber.from(await ghstDiamond.balanceOf(account))

    // Claim ghost and stake
    await global.aavegotchiFacet.claimAavegotchiFromPortal('1', 0, minStake)
    const balanceAfterClaim = BigNumber.from(await ghstDiamond.balanceOf(account))
    expect(balanceAfterClaim).to.equal(initialBalance.sub(minStake))

    // Burn Aavegotchi and return collateral stake
    await global.escrowFacet.decreaseAndDestroy('1')
    const balanceAfterDestroy = BigNumber.from(await ghstDiamond.balanceOf(account))
    expect(balanceAfterDestroy).to.equal(initialBalance)

    // Should only have 1 portal now
    myPortals = await global.aavegotchiFacet.allAavegotchisOfOwner(account)
    expect(myPortals.length).to.equal(4)
  })
})

describe('Wearables', async function () {
  it('Can mint wearables', async function () {
    let balance = await global.wearablesFacet.balanceOf(account, '0')
    expect(balance).to.equal(0)
    // To do: Get max length of wearables array

    //  await truffleAssert.reverts(wearablesFacet.mintWearables(account, ['8'], ['10']), 'WearablesFacet: Wearable does not exist')
    await truffleAssert.reverts(wearablesFacet.mintWearables(account, ['0'], ['10']), 'WearablesFacet: Total wearable type quantity exceeds max quantity')
    await global.wearablesFacet.mintWearables(account, [testWearableId], ['10'])
    balance = await global.wearablesFacet.balanceOf(account, testWearableId)
    expect(balance).to.equal(10)
  })

  it('Can transfer wearables to Aavegotchi', async function () {
    await global.wearablesFacet.transferToParent(
      global.account, // address _from,
      global.aavegotchiFacet.address, // address _toContract,
      testAavegotchiId, // uint256 _toTokenId,
      testWearableId, // uint256 _id,
      '10' // uint256 _value
    )
    const balance = await global.wearablesFacet.balanceOfToken(aavegotchiFacet.address, testAavegotchiId, testWearableId)
    expect(balance).to.equal(10)
  })

  it('Can transfer wearables from Aavegotchi back to owner', async function () {
    await global.wearablesFacet.transferFromParent(
      global.aavegotchiFacet.address, // address _fromContract,
      testAavegotchiId, // uint256 _fromTokenId,
      global.account, // address _to,
      testWearableId, // uint256 _id,
      '10' // uint256 _value
    )
    const balance = await global.wearablesFacet.balanceOf(account, testWearableId)
    expect(balance).to.equal(10)
  })

  it('Can equip wearables', async function () {
    // First transfer wearables to parent Aavegotchi
    await global.wearablesFacet.transferToParent(
      global.account, global.aavegotchiFacet.address, testAavegotchiId, testWearableId, '10')
    expect(await global.wearablesFacet.balanceOfToken(aavegotchiFacet.address, testAavegotchiId, testWearableId)).to.equal(10)

    // Now let's equip
    await global.wearablesFacet.equipWearables(testAavegotchiId, [testWearableId], [testSlot])
    const equipped = await global.wearablesFacet.equippedWearables(testAavegotchiId)

    expect(equipped.length).to.equal(16)
    // First item in array is 1 because that wearable has been equipped
    expect(equipped[testSlot]).to.equal(testWearableId)
  })

  /*
  it('Can display aavegotchi with wearables', async function () {
    const svg = await global.aavegotchiFacet.getAavegotchiSvg(testAavegotchiId)
    console.log(svg)
  })
  */

  it('Cannot equip wearables in the wrong slot', async function () {
    await truffleAssert.reverts(wearablesFacet.equipWearables(testAavegotchiId, [testWearableId], ['4']), 'WearablesFacet: Cannot be equipped in this slot')
  })

  it('Can de-equip wearables', async function () {
    await global.wearablesFacet.unequipWearables(testAavegotchiId, [testSlot])
    const equipped = await global.wearablesFacet.equippedWearables(testAavegotchiId)

    expect(equipped.length).to.equal(16)
    expect(equipped[testSlot]).to.equal(0)
  })

  it('Equipping Wearables alters base rarity score', async function () {
    // Wearables sanity check
    const equipped = await global.wearablesFacet.equippedWearables(testAavegotchiId)
    expect(equipped[testSlot]).to.equal(0)
    const originalScore = await global.aavegotchiFacet.calculateModifiedRarityScore(testAavegotchiId)

    // Equip a wearable
    await global.wearablesFacet.equipWearables(testAavegotchiId, [testWearableId], [testSlot])

    // Calculate bonuses
    const modifiers = uintToIntArray(wearableTypes[testWearableId].traitModifiers, 6)
    let wearableTraitsBonus = 0
    const rarityScoreModifier = wearableTypes[testWearableId].rarityScoreModifier
    modifiers.forEach((val) => { wearableTraitsBonus += val })
    // Retrieve the final score
    const augmentedScore = await global.aavegotchiFacet.calculateModifiedRarityScore(testAavegotchiId)
    // console.log(originalScore.toString(), augmentedScore.toString())
    expect(augmentedScore).to.equal(Number(originalScore) + rarityScoreModifier + wearableTraitsBonus)
  })

  it('Can equip multi-slot wearables', async function () {
    const multiSlotWearableId = '2'
    await global.wearablesFacet.mintWearables(account, [multiSlotWearableId], ['10'])

    await global.wearablesFacet.transferToParent(
      global.account, global.aavegotchiFacet.address, testAavegotchiId, multiSlotWearableId, '10')
    await global.wearablesFacet.equipWearables(testAavegotchiId, [multiSlotWearableId], ['9'])
    const equipped = await global.wearablesFacet.equippedWearables(testAavegotchiId)

    // const aavegotchi = await global.aavegotchiFacet.getAavegotchi(testAavegotchiId)
    // console.log(aavegotchi.equippedWearables)

    // This wearable gets equipped in the ninth slot, which takes up 0&1 slots
    expect(equipped[9]).to.equal('2')
  })
})

describe('Haunts', async function () {
  it('Cannot create new haunt until first is finished', async function () {
    const oneHundred = '100000000000000000000'
    await truffleAssert.reverts(aavegotchiFacet.createHaunt('10000', oneHundred, '0x000000'), 'AavegotchiFacet: Haunt must be full before creating new')
  })

  it('Cannot exceed max haunt size', async function () {
    // Reverting for unknown reason. Probably gas related?
    //  const balance = await ghstDiamond.balanceOf(account)
    const oneHundredPortals = ethers.utils.parseEther('9500')
    const tx = await global.aavegotchiFacet.buyPortals(account, oneHundredPortals, true)

    const singlePortal = ethers.utils.parseEther('100')
    await truffleAssert.reverts(global.aavegotchiFacet.buyPortals(account, singlePortal, true), 'AavegotchiFacet: Exceeded max number of aavegotchis for this haunt')

    const receipt = await tx.wait()
    // console.log('gas used:' + receipt.gasUsed)
  })

  it('Can create new Haunt', async function () {
    let currentHaunt = await aavegotchiFacet.currentHaunt()
    expect(currentHaunt.hauntId_).to.equal(0)
    await aavegotchiFacet.createHaunt('10000', ethers.utils.parseEther('100'), '0x000000')
    currentHaunt = await aavegotchiFacet.currentHaunt()
    expect(currentHaunt.hauntId_).to.equal(1)
  })

  // To do: Test allowing DAO to create haunt
})

describe('Shop and Vouchers', async function () {
  it('Should create vouchers', async function () {
    await global.vouchersContract.createVoucherTypes(account, ['10', '20', '30', '40', '50', '60'], [])
    const supply = await global.vouchersContract.totalSupplies()
    expect(supply[5]).to.equal(60)
  })

  it('Should convert vouchers into wearables', async function () {
    await global.vouchersContract.setApprovalForAll(shopFacet.address, true)
    await global.shopFacet.purchaseWearablesWithVouchers(account, [0, 1, 2, 3, 4, 5], [10, 10, 10, 10, 10, 60])
    const wearablesBalance = await global.wearablesFacet.wearablesBalances(account)
    expect(wearablesBalance[6]).to.equal(60)
  })

  it('Should purchase wearables using GHST', async function () {
    let balances = await global.wearablesFacet.wearablesBalances(account)
    // Start at 1 because 0 is always empty
    expect(balances[1]).to.equal(10)
    await global.shopFacet.purchaseWearablesWithGhst(account, ['1'], ['10'])
    balances = await global.wearablesFacet.wearablesBalances(account)
    expect(balances[1]).to.equal(20)
  })
})

describe("Kinship", async function () {

  it('Can calculate kinship according to formula', async function () {
    // First interact

    await global.aavegotchiFacet.interact('0')
    await global.aavegotchiFacet.interact('0')
    await global.aavegotchiFacet.interact('0')
    await global.aavegotchiFacet.interact('0')
    await global.aavegotchiFacet.interact('0')
    let kinship = await global.aavegotchiFacet.calculateKinship('0')
    console.log('* 5 initial Interactions, kinship is:', kinship.toString())
    // 5 interactions + 1 streak bonus
    // expect(kinship).to.equal(55)

    // Go 3 days without interacting
    ethers.provider.send('evm_increaseTime', [3 * 86400])
    ethers.provider.send('evm_mine')

    kinship = await global.aavegotchiFacet.calculateKinship('0')
    // Took three days off and lost streak bonus
    console.log('* 3 days w/ no interaction, kinship is:', kinship.toString())

    // Take a longggg break

    ethers.provider.send('evm_increaseTime', [14 * 86400])
    ethers.provider.send('evm_mine')

    kinship = await global.aavegotchiFacet.calculateKinship('0')
    console.log('* Another 14 days since last interaction, total 17 days. Kinship is', kinship.toString())

    ethers.provider.send('evm_increaseTime', [20 * 86400])
    ethers.provider.send('evm_mine')
    kinship = await global.aavegotchiFacet.calculateKinship('0')
    console.log('* 37 days since last interaction, kinship is:', kinship.toString())
    // expect(kinship).to.equal(13)

    await global.aavegotchiFacet.interact('0')
    kinship = await global.aavegotchiFacet.calculateKinship('0')
    console.log('* Kinship after first interaction is:', kinship.toString())

    await global.aavegotchiFacet.interact('0')
    kinship = await global.aavegotchiFacet.calculateKinship('0')
    console.log('* Kinship after second interaction is:', kinship.toString())

    await global.aavegotchiFacet.interact('0')
    kinship = await global.aavegotchiFacet.calculateKinship('0')
    console.log('* Kinship after third interaction is:', kinship.toString())

    console.log('* Interact 120 times')

    for (let index = 0; index < 120; index++) {
      await global.aavegotchiFacet.interact('0')
    }

    kinship = await global.aavegotchiFacet.calculateKinship('0')
    console.log('* Kinship is:', kinship.toString())

    // ethers.provider.send('evm_increaseTime', [10 * 86400])
    // ethers.provider.send('evm_mine')
    // kinship = await global.aavegotchiFacet.calculateKinship('0')

    let aavegotchi = await global.aavegotchiFacet.getAavegotchi('0')

    let daysSinceInteraction = 0
    for (let index = 0; index < 12; index++) {

      let days = 10
      daysSinceInteraction += days

      ethers.provider.send('evm_increaseTime', [days * 86400])
      ethers.provider.send('evm_mine')
      kinship = await global.aavegotchiFacet.calculateKinship('0')

      aavegotchi = await global.aavegotchiFacet.getAavegotchi('0')

      console.log(`* Go away for ${days} days. Kinship is: `, kinship.toString())
    }


    await global.aavegotchiFacet.interact('0')
    kinship = await global.aavegotchiFacet.calculateKinship('0')
    console.log(`* Interact after ${daysSinceInteraction} days. Kinship is: `, kinship.toString())
    aavegotchi = await global.aavegotchiFacet.getAavegotchi('0')


    daysSinceInteraction = 0
    for (let index = 0; index < 5; index++) {

      let days = 10
      daysSinceInteraction += days

      ethers.provider.send('evm_increaseTime', [days * 86400])
      ethers.provider.send('evm_mine')
      kinship = await global.aavegotchiFacet.calculateKinship('0')

      aavegotchi = await global.aavegotchiFacet.getAavegotchi('0')

      console.log(`* Go away for ${days} days. Kinship is: `, kinship.toString())
    }


    console.log('* Interact 120 times')
    for (let index = 0; index < 120; index++) {
      await global.aavegotchiFacet.interact('0')
    }

    kinship = await global.aavegotchiFacet.calculateKinship('0')
    console.log('* Kinship is:', kinship.toString())
  })


})


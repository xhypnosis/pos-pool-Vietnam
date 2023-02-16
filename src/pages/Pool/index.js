import React, {useState, useEffect, useCallback} from 'react'
import {Input, Button, Divider, Form, List, message, Col, Row, Spin} from 'antd'
import {useParams, useSearchParams} from 'react-router-dom'
import BigNumber from 'bignumber.js'
import {format} from 'js-conflux-sdk/dist/js-conflux-sdk.umd.min.js'
import {useTranslation} from 'react-i18next'
import {
  Drip,
  getPosAccountByPowAddress,
  conflux as confluxController,
} from '../../utils/cfx'
import {
  getCfxByVote,
  getFee,
  getDateByBlockInterval,
  getMax,
  getPrecisionAmount,
  calculateGasMargin,
} from '../../utils'
import {
  useBalance,
  useAccount,
  useChainId,
  useSendTransaction,
  Unit,
} from '../../hooks/useWallet'
import {provider as metaMaskProvider} from '@cfxjs/use-wallet/dist/ethereum'
import useCurrentSpace from '../../hooks/useCurrentSpace'
import {CFX_BASE_PER_VOTE, StatusPosNode} from '../../constants'
import Header from './Header'
import ConfirmModal from './ConfirmModal'
import TxModal from './TxModal'
import usePoolContract from '../../hooks/usePoolContract'
import useCurrentNetwork from '../../hooks/useCurrentNetwork'
import useIsNetworkMatch from '../../hooks/useIsNetworkMatch'

import tips from '../../images/tips.svg' // hypnos

function Pool() {
  const {t} = useTranslation()
  const currentSpace = useCurrentSpace()
  const chainId = useChainId()
  const accountAddress = useAccount()
  const sendTransaction = useSendTransaction()
  const [form] = Form.useForm()
  const _balance = useBalance()
  const balance = _balance?.toDecimalStandardUnit(5)
  const cfxMaxCanStake = getMax(balance)
  const {poolAddress} = useParams()
  const [searchParams] = useSearchParams()
  const currentNetwork = useCurrentNetwork()

  const {contract: posPoolContract, interface: posPoolInterface} =
    usePoolContract()
  const [status, setStatus] = useState(StatusPosNode.loading)
  const [stakedCfx, setStakedCfx] = useState(0)
  const [rewards, setRewards] = useState(0)
  const [fee, setFee] = useState(0)
  const [cfxCanUnstake, setCfxCanUnstate] = useState(0)
  const [cfxCanWithdraw, setCfxCanWithdraw] = useState(0)
  const [inputStakeCfx, setInputStakeCfx] = useState('')
  const [inputUnstakeCfx, setInputUnstakeCfx] = useState('')
  const [userSummary, setUserSummary] = useState([])
  const [currentBlockNumber, setCurrentBlockNumber] = useState(0)
  const [lastDistributeTime, setLastDistributeTime] = useState('')
  const [unstakeList, setUnstakeList] = useState([])
  const [stakeModalShown, setStakeModalShown] = useState(false)
  const [unstakeModalShown, setUnStakeModalShown] = useState(false)
  const [txModalShown, setTxModalShown] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [stakeInputStatus, setStakeInputStatus] = useState('error')
  const [stakeErrorText, setStakeErrorText] = useState('')
  const [unstakeInputStatus, setUnstakeInputStatus] = useState('error')
  const [unstakeErrorText, setUnstakeErrorText] = useState('')
  const [stakeBtnDisabled, setStakeBtnDisabled] = useState(true)
  const [unstakeBtnDisabled, setUnstakeBtnDisabled] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [waitStakeRes, setWaitStakeRes] = useState(false)
  const isNetworkMatch = useIsNetworkMatch()

  useEffect(() => {
    async function fetchData() {
      const proArr = []
      proArr.push(
        currentSpace === 'core'
          ? confluxController.provider.call('cfx_getStatus')
          : fetch(currentNetwork.url, {
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_blockNumber',
                params: [],
                id: 83,
              }),
              headers: {'content-type': 'application/json'},
              method: 'POST',
            })
              .then(response => response?.json())
              .then(res => res?.result),
      )
      proArr.push(confluxController.provider.call('cfx_getPoSEconomics'))
      const data = await Promise.all(proArr)

      let currentBlock
      if (currentSpace === 'core') {
        currentBlock = new BigNumber(data[0]?.blockNumber || 0).toNumber()
      } else {
        currentBlock = new BigNumber(data[0] || 0).toNumber()
      }
      const lastDistribute = new BigNumber(
        data[1]?.lastDistributeBlock || 0,
      ).toNumber()
      setCurrentBlockNumber(currentBlock)
      setLastDistributeTime(
        getDateByBlockInterval(
          lastDistribute,
          currentBlock,
          currentSpace,
        ).toLocaleString(),
      )
    }
    fetchData()
  }, [currentSpace, currentNetwork?.url])

  useEffect(() => {
    if (status) {
      if (stakeErrorText) {
        setStakeBtnDisabled(true)
      } else {
        setStakeBtnDisabled(false)
      }
    } else {
      setStakeBtnDisabled(true)
    }
  }, [stakeErrorText, status])

  useEffect(() => {
    if (status) {
      if (unstakeErrorText) {
        setUnstakeBtnDisabled(true)
      } else {
        setUnstakeBtnDisabled(false)
      }
    } else {
      setUnstakeBtnDisabled(true)
    }
  }, [unstakeErrorText, status])

  useEffect(() => {
    if (currentSpace === 'eSpace' && !searchParams.get('coreAddress')) {
      setStatus(StatusPosNode.warning)
      return
    }

    async function fetchData() {
      try {
        const posAccount = await getPosAccountByPowAddress(
          currentSpace === 'core'
            ? poolAddress
            : searchParams.get('coreAddress'),
        )
        setStatus(
          posAccount.status?.forceRetired == null
            ? StatusPosNode.success
            : StatusPosNode.error,
        )
      } catch (error) {
        console.log(error)
        setStatus(StatusPosNode.warning)
      }
    }
    fetchData()
  }, [currentSpace, searchParams, poolAddress])

  useEffect(() => {
    try {
      const stakeCfxNum = Number(inputStakeCfx)
      if (
        stakeCfxNum >= CFX_BASE_PER_VOTE &&
        stakeCfxNum <= cfxMaxCanStake &&
        stakeCfxNum % CFX_BASE_PER_VOTE === 0
      ) {
        setStakeInputStatus('green')
        setStakeErrorText('')
      } else {
        setStakeInputStatus('error')
        setStakeErrorText(t('Pool.wrong_amount'))
      }
    } catch (error) {
      setStakeInputStatus('error')
      setStakeErrorText(t('Pool.wrong_amount'))
    }
  }, [cfxMaxCanStake, inputStakeCfx, t])

  useEffect(() => {
    try {
      const cfxNum = Number(inputUnstakeCfx)
      if (
        cfxNum >= CFX_BASE_PER_VOTE &&
        cfxNum <= cfxCanUnstake &&
        cfxNum % CFX_BASE_PER_VOTE === 0
      ) {
        setUnstakeInputStatus('green')
        setUnstakeErrorText('')
      } else {
        setUnstakeInputStatus('error')
        setUnstakeErrorText(t('Pool.wrong_amount'))
      }
    } catch (error) {
      setUnstakeInputStatus('error')
      setUnstakeErrorText(t('Pool.wrong_amount'))
    }
  }, [cfxCanUnstake, inputUnstakeCfx, t])

  function resetData() {
    setStakedCfx(0)
    setRewards(0)
    setCfxCanUnstate(0)
    setCfxCanWithdraw(0)
  }

  const fetchPoolData = useCallback(async () => {
    if (isLoading || currentBlockNumber === 0) return
    setIsLoading(true)
    try {
      const proArr = []
      proArr.push(posPoolContract.userSummary(accountAddress))
      proArr.push(posPoolContract.userInterest(accountAddress))
      proArr.push(
        (
          posPoolContract.userOutQueue ||
          posPoolContract['userOutQueue(address)']
        )(accountAddress),
      )

      const data = await Promise.all(proArr)
      const userSum = data[0]
      setUserSummary(userSum)
      setStakedCfx(
        new BigNumber(userSum?.[1]?._hex || userSum[1] || 0)
          .multipliedBy(CFX_BASE_PER_VOTE)
          .toString(10),
      )
      setCfxCanUnstate(getCfxByVote(userSum?.[2]?._hex || userSum[2]))
      setCfxCanWithdraw(getCfxByVote(userSum?.[3]?._hex || userSum[3]))
      setRewards(
        getPrecisionAmount(
          new Drip(
            new BigNumber(data[1]?._hex || data[1]).toString(10),
          ).toCFX(),
          5,
        ),
      )
      setUnstakeList(transferQueue(data[2]))

      // get user performance fee
      let fee
      try {
        fee = await posPoolContract
          .userShareRatio()
          .call({from: accountAddress})
      } catch (err) {
        fee = await posPoolContract.poolUserShareRatio()
      }
      // console.log("User performance fee: ", fee);
      setFee(getFee(fee?._hex || fee))

      setIsLoading(false)
    } catch (error) {
      console.log('fetchPoolData error: ', error)
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, currentBlockNumber, isLoading])

  useEffect(() => {
    if (!waitStakeRes) return
    if (accountAddress) {
      fetchPoolData()
      setWaitStakeRes(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance])

  useEffect(() => {
    if (accountAddress) {
      fetchPoolData()
    } else {
      resetData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, currentBlockNumber])

  const transferQueue = queueList => {
    if (queueList?.length === 0) return []
    const arr = []
    queueList.forEach(item => {
      const blockNumber = new BigNumber(item[1]?._hex || item[1]).toNumber()
      if (blockNumber > currentBlockNumber) {
        arr.push({
          amount: getCfxByVote(item[0]?._hex || item[0]),
          timeStr: getDateByBlockInterval(
            blockNumber,
            currentBlockNumber,
            currentSpace,
          ).toLocaleString(),
        })
      }
    })
    return arr
  }

  const onStakeChange = e => {
    setInputStakeCfx(e.target.value)
  }

  const onUnstakeChange = e => {
    setInputUnstakeCfx(e.target.value)
  }

  const submit = async type => {
    if (!accountAddress) {
      message.error('Please connect Fluent')
      return
    }

    try {
      let data = ''
      let estimateData = {}
      let value = 0
      switch (type) {
        case 'stake':
          value = new BigNumber(inputStakeCfx)
            .multipliedBy(10 ** 18)
            .toString(10)
          const stakeVote = new BigNumber(inputStakeCfx)
            .dividedBy(CFX_BASE_PER_VOTE)
            .toString(10)
          if (currentSpace === 'core') {
            data = posPoolContract.increaseStake(stakeVote).data
            estimateData = await posPoolContract
              .increaseStake(stakeVote)
              .estimateGasAndCollateral({
                from: accountAddress,
                value,
              })
          } else {
            data = posPoolInterface.encodeFunctionData('increaseStake', [
              stakeVote,
            ])
          }
          setWaitStakeRes(true)
          break
        case 'unstake':
          value = 0
          const unstakeVote = new BigNumber(inputUnstakeCfx)
            .dividedBy(CFX_BASE_PER_VOTE)
            .toString(10)
          if (currentSpace === 'core') {
            data = posPoolContract.decreaseStake(unstakeVote).data
            estimateData = await posPoolContract
              .decreaseStake(unstakeVote)
              .estimateGasAndCollateral({
                from: accountAddress,
              })
          } else {
            data = posPoolInterface.encodeFunctionData('decreaseStake', [
              unstakeVote,
            ])
          }
          break
        case 'claim':
          value = 0
          if (currentSpace === 'core') {
            data = posPoolContract.claimAllInterest().data
            estimateData = await posPoolContract
              .claimAllInterest()
              .estimateGasAndCollateral({
                from: accountAddress,
              })
          } else {
            data = posPoolInterface.encodeFunctionData('claimAllInterest', [])
          }
          break
        case 'withdraw':
          value = 0
          if (currentSpace === 'core') {
            data = posPoolContract.withdrawStake(
              new BigNumber(userSummary?.[3]?._hex || userSummary[3]).toString(
                10,
              ),
            ).data
            estimateData = await posPoolContract
              .withdrawStake(new BigNumber(userSummary[3]).toString(10))
              .estimateGasAndCollateral({
                from: accountAddress,
              })
          } else {
            data = posPoolInterface.encodeFunctionData('withdrawStake', [
              new BigNumber(userSummary?.[3]?._hex || userSummary[3]).toString(
                10,
              ),
            ])
          }
          break
        default:
          break
      }
      const txParams = {
        to:
          currentSpace === 'core'
            ? format.address(poolAddress, Number(chainId))
            : poolAddress,
        data,
        value: Unit.fromMinUnit(value).toHexMinUnit(),
      }

      if (currentSpace === 'eSpace') {
        estimateData.gasLimit = await metaMaskProvider.request({
          method: 'eth_estimateGas',
          params: [
            {
              from: accountAddress,
              data,
              to: poolAddress,
              value: Unit.fromMinUnit(value).toHexMinUnit(),
            },
          ],
        })
      }
      if (estimateData?.gasLimit) {
        txParams.gas = Unit.fromMinUnit(
          calculateGasMargin(estimateData?.gasLimit || 0),
        ).toHexMinUnit()
      }
      if (estimateData?.storageCollateralized) {
        txParams.storageLimit = Unit.fromMinUnit(
          calculateGasMargin(String(estimateData?.storageCollateralized || 0)),
        ).toHexMinUnit()
      }

      if (stakeModalShown) {
        setStakeModalShown(false)
      }
      if (unstakeModalShown) {
        setUnStakeModalShown(false)
      }
      const txHash = await sendTransaction(txParams)
      setTxHash(txHash)
      setTxModalShown(true)
    } catch (error) {
      // hypnos+test
      let reg = RegExp('not enough unlocked staking balance to withdraw')
      if (reg.test(error)) {
        message.error(
          error +
            'it may takes longer than expected for your staked votes to be unlocked, please wait a few hours before try to withdraw again',
        )
      }
      console.error('error', error)
    }
  }

  const checkNetwork = callback => {
    if (!isNetworkMatch) {
      return
    }

    if (typeof callback === 'function') callback()
  }

  return (
    // <div className="relative w-full h-full flex">
    // hypnos
    <div className="w-full flex font-body font-medium relative">
      {isLoading && (
        <Spin
          className="top-[50%] left-[50%] -translate-x-[50%] -translate-y-[50%]"
          style={{position: 'absolute'}}
        ></Spin>
      )}
      {/* <div className="container mx-auto"> hypnos*/}
      <div className="container mx-auto" style={{width: 1200}}>
        <Header status={status} />
        <div className="flex justify-center mt-6">
          {/* <div className="w-9/12"> hypnos*/}
          <div className="w-full">
            {/* <div className="flex"> hypnos*/}
            <div className="flex h-full">
              {/* <div className="flex-1 p-6 mr-4 -ml-2 border-gray-800 border-2 text-white box-border rounded bg-main-back"> hypnos*/}
              <div className="flex-1 border-gray-800 border-2 text-black box-border rounded bg-main-back pl-[32px] pr-[16px]">
                <Form
                  layout="vertical"
                  form={form}
                  wrapperCol={{style: {color: 'white'}}}
                  // style={{ color: 'white' }}
                  // hypnbos
                  style={{width: 524}}
                >
                  {/* <div className="font-bold my-4 text-xl text-center">
                                        {t('Pool.stake&unstake')}
                                    </div> hypnos*/}
                  <div className="font-bold my-6 text-base text-center">
                    {t('Pool.stake&unstake')}
                  </div>
                  {/* <div className="my-2">{t('Pool.how_much_stake')}</div> hypnos*/}
                  <div className="font-medium my-2 text-sm text-gray-400">
                    {t('Pool.how_much_stake')}
                  </div>
                  <Form.Item
                    required
                    validateStatus={stakeInputStatus}
                    help={stakeErrorText}
                  >
                    <Row>
                      {/* <Col span={21}> hypnos*/}
                      <Col span={24}>
                        <Input
                          // hypnos+s
                          style={{
                            color: '#333333',
                            width: '100%',
                            height: 40,
                            fontWeight: '500',
                            background: '#F8F8F8',
                          }}
                          placeholder={t('Pool.enter_cfx_amount')}
                          //   addonAfter={<span>Max</span>}
                          value={inputStakeCfx}
                          onChange={onStakeChange}
                          // hypnos+sf
                          suffix="CFX"
                        />
                      </Col>
                      {/* hypnos-c */}
                      {/* <Col span={3}>
                                                <Button
                                                    disabled={isLoading}
                                                    onClick={() => {
                                                        setInputStakeCfx(cfxMaxCanStake)
                                                    }}
                                                >
                                                    {t('Pool.max')}
                                                </Button>
                                            </Col> */}
                    </Row>
                  </Form.Item>
                  {/* <div> hypnos*/}
                  <div className="font-medium">
                    <span>{t('Pool.balance')}</span>
                    {/* <span className="ml-2 font-bold">{balance}</span> hypnos*/}
                    <span className="ml-2">{balance}</span>
                    <span> CFX</span>
                    {/* hypnos+B */}
                    <Button
                      style={{
                        border: 'none',
                        fontWeight: '500',
                        color: '#1E3DE4',
                      }}
                      onClick={() => {
                        setInputStakeCfx(cfxMaxCanStake)
                      }}
                    >
                      MAX
                    </Button>
                  </div>
                  <div className="flex mt-2">
                    <Button
                      // hypnos+s
                      style={{
                        width: 140,
                        height: 40,
                        lineHeight: '18px',
                        fontWeight: '500',
                        background: '#546FFF',
                        color: 'white',
                      }}
                      type="primary"
                      // size="middle" hypnos
                      onClick={() => {
                        checkNetwork(() => setStakeModalShown(true))
                      }}
                      disabled={isLoading || stakeBtnDisabled}
                      //   disabled="true"
                    >
                      {t('Pool.stake')}
                    </Button>
                  </div>
                  {/* <Divider dashed style={{ borderColor: 'white' }} /> hypnos*/}
                  <Divider dashed style={{borderColor: '#DDDDDD'}} />
                  {/* <div className="my-1">{t('Pool.how_much_unstake')}</div> hypnos*/}
                  <div className="font-medium my-2 text-sm text-gray-400">
                    {t('Pool.how_much_unstake')}
                  </div>
                  <Form.Item
                    required
                    validateStatus={unstakeInputStatus}
                    help={unstakeErrorText}
                  >
                    <Row>
                      {/* <Col span={21}> hypnos*/}
                      <Col span={24}>
                        <Input
                          // hypnos+s
                          style={{
                            color: '#333333',
                            width: '100%',
                            height: 40,
                            fontWeight: '500',
                            backgroundColor: '#F8F8F8',
                          }}
                          placeholder={t('Pool.enter_cfx_amount')}
                          value={inputUnstakeCfx}
                          onChange={onUnstakeChange}
                          // hypnos+sf
                          suffix="CFX"
                        />
                      </Col>
                      {/* hypnos-c */}
                      {/* <Col span={3}>
                                                <Button
                                                    onClick={() => {
                                                        setInputUnstakeCfx(cfxCanUnstake)
                                                    }}
                                                    disabled={isLoading}
                                                >
                                                    {t('Pool.max')}
                                                </Button>
                                            </Col> */}
                    </Row>
                  </Form.Item>

                  {/* <div> hypnos*/}
                  <div className="font-medium">
                    <span>{t('Pool.unstakeable')}</span>
                    {/* <span className="ml-2 font-bold">{cfxCanUnstake}</span> hypnos*/}
                    <span className="ml-2">{cfxCanUnstake}</span>
                    <span> CFX</span>
                    {/* hypnos+B */}
                    <Button
                      style={{
                        border: 'none',
                        fontWeight: '500',
                        color: '#1E3DE4',
                      }}
                      onClick={() => {
                        setInputUnstakeCfx(cfxCanUnstake)
                      }}
                    >
                      MAX
                    </Button>
                  </div>
                  <div className="flex mt-2">
                    <Button
                      // hypnos+s
                      style={{
                        width: 140,
                        height: 40,
                        lineHeight: '18px',
                        fontWeight: '500',
                        background: '#546FFF',
                        color: 'white',
                      }}
                      type="primary"
                      // size="middle" hypnos
                      onClick={() => {
                        checkNetwork(() => setUnStakeModalShown(true))
                      }}
                      disabled={isLoading || unstakeBtnDisabled}
                    >
                      {t('Pool.unstake')}
                    </Button>
                  </div>
                </Form>
              </div>
              {/* hypnos+d */}
              <div className="w-[24px]"></div>
              {/* <div className="flex-1 p-6 border-gray-800 border-2 box-border rounded bg-main-back text-white"> hypnos*/}
              <div className="flex-1 p-6 border-gray-800 border-2 box-border rounded bg-main-back text-black font-medium">
                {/* <div className="font-bold my-4 text-xl text-center mb-4">
                                    {t('Pool.my_pool')}
                                </div> hypnos*/}
                <div className="font-bold mt-1 text-base text-center">
                  {t('Pool.my_pool')}
                </div>
                {/* hypnos+d */}
                <div className="my-1 text-gray-400 text-center text-xs">
                  <span>{t('Pool.last_update_time')}</span>
                  <span>{lastDistributeTime}</span>
                </div>
                {/* hypnos-2d */}
                {/* <div className="mt-7">
                                    <span>{t('Pool.my_staked')}</span>
                                    <span className="ml-2 font-bold">{stakedCfx}</span>
                                    <span> CFX</span>
                                </div>
                                <div className="my-4">
                                    <span>{t('Pool.my_rewards')}</span>
                                    <span className="ml-2 font-bold">{rewards}</span>
                                    <span> CFX</span>
                                    <span className="ml-2">
                                        <Button
                                            type="primary"
                                            size="small"
                                            onClick={() => {
                                                checkNetwork(() => submit('claim'))
                                            }}
                                            disabled={isLoading || new BigNumber(rewards).isEqualTo(0)}
                                        >
                                            {t('Pool.claim')}
                                        </Button>
                                    </span>
                                </div> */}
                {/* hypnos-2d */}
                {/* <div className="my-2 opacity-60">
                                    <span>{t('Pool.last_update_time')}</span>
                                    <span>{lastDistributeTime}</span>
                                </div>
                                <div className="my-4">
                                    <span>{t('Pool.performance_fee')}</span>
                                    <span className="ml-2 font-bold">{`${fee} %`}</span>
                                </div> */}
                {/* hypnos+R */}
                <Row className="vertical-top w-full mt-4">
                  <Col span={7} offset={1}>
                    <span className="font-normal">{t('Pool.my_staked')}</span>
                    <br />
                    <span className="text-m">{stakedCfx}</span>
                    <span className="text-xs text-gray-500"> CFX</span>
                    <br />
                    <br />
                    <Button
                      style={{
                        width: 140,
                        height: 40,
                        lineHeight: '18px',
                        fontWeight: '500',
                        background: '#546FFF',
                        color: 'white',
                      }}
                      type="primary"
                      onClick={() => {
                        checkNetwork(() => submit('claim'))
                      }}
                      disabled={new BigNumber(rewards).isEqualTo(0)}
                    >
                      {t('Pool.claim')}
                    </Button>
                  </Col>
                  <Col span={6} offset={2}>
                    <span className="font-normal ">{t('Pool.my_rewards')}</span>
                    <br />
                    <span className="text-m" style={{color: '#1E3DE4'}}>
                      {rewards}
                    </span>
                    <span className="text-xs text-gray-500"> CFX</span>
                  </Col>
                  <Col span={6} offset={2}>
                    <span className="font-normal ">
                      {t('Pool.performance_fee')}
                    </span>
                    <br />
                    <span className="text-m">{`${fee} %`}</span>
                  </Col>
                </Row>
                <Divider dashed style={{borderColor: 'white'}} />
                <div>
                  {/* <span>{t('Pool.withdrawable')}</span> hypnos*/}
                  <span className="font-normal text-base ml-6">
                    {t('Pool.withdrawable')}
                  </span>
                  {/* <span className="ml-2 font-bold">{cfxCanWithdraw}</span>
                                    <span> CFX</span> hypnos*/}
                  <span
                    className="float-right text-m font-bold"
                    style={{color: '#1E3DE4'}}
                  >
                    {cfxCanWithdraw}
                    <span className="text-xs text-gray-500"> CFX</span>
                  </span>
                  <br />
                  <br />
                  {/* <span className="ml-2">
                                        <Button
                                            type="primary"
                                            size="small"
                                            onClick={() => {
                                                checkNetwork(() => submit('withdraw'))
                                            }}
                                            disabled={isLoading || !cfxCanWithdraw}
                                        >
                                            {t('Pool.withdraw')}
                                        </Button>
                                    </span> hypnos*/}
                  <Button
                    className="ml-6"
                    style={{
                      width: 140,
                      height: 40,
                      lineHeight: '18px',
                      fontWeight: '500',
                      background: '#546FFF',
                      color: 'white',
                    }}
                    type="primary"
                    onClick={() => {
                      checkNetwork(() => submit('withdraw'))
                    }}
                    disabled={!cfxCanWithdraw}
                  >
                    {t('Pool.withdraw')}
                  </Button>
                </div>
                {/* hypnos+d */}
                <div className="w-[524px] h-[78px] mt-10 ml-6">
                  <img src={tips} alt="" />
                </div>
              </div>
            </div>
            <div className={`${unstakeList.length > 0 ? 'block' : 'hidden'}`}>
              {/* <Divider
                                dashed
                                orientation="left"
                                style={{ borderColor: 'white', color: 'white' }}
                            >
                                {t('Pool.unstake_activity')}
                            </Divider> hypnos*/}
              <Divider
                dashed
                orientation="left"
                style={{borderColor: '#333333', color: '#333333'}}
              >
                {t('Pool.unstake_activity')}
              </Divider>
              <List
                // hypnos+s
                style={{borderColor: '#333333'}}
                bordered
                dataSource={unstakeList}
                renderItem={item => (
                  <List.Item>
                    {/* <div className="text-white">{`${item.amount} CFX`}</div> hypnos*/}
                    <div className="text-black">{`${item.amount} CFX`}</div>
                    {/* <div className="text-white">
                                            {t('Pool.can_withdraw_at', { time: item.timeStr })}
                                        </div> hypnos*/}
                    <div className="text-black">
                      {t('Pool.can_withdraw_at', {time: item.timeStr})}
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </div>
        </div>
      </div>
      <ConfirmModal
        visible={stakeModalShown}
        setVisible={setStakeModalShown}
        type="stake"
        onOk={() => {
          submit('stake')
        }}
      ></ConfirmModal>
      <ConfirmModal
        visible={unstakeModalShown}
        setVisible={setUnStakeModalShown}
        type="unstake"
        onOk={() => {
          submit('unstake')
        }}
      ></ConfirmModal>
      <TxModal
        visible={txModalShown}
        setVisible={setTxModalShown}
        txHash={txHash}
      ></TxModal>
    </div>
  )
}

export default Pool

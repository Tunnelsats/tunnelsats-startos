let statusData = {};
let countdownInterval = null;

async function fetchStatus() {
    try {
        const response = await fetch('/api/status');
        if (response.ok) {
            statusData = await response.json();
            updateUI();
        }
    } catch (error) {
        console.error("Failed to fetch status:", error);
    }
}

function updateUI() {
    // 1. Status Badge
    const badge = document.getElementById('status-badge');
    const badgeText = badge.querySelector('.status-text');
    
    if (statusData.enabled) {
        if (statusData.vpn_connected && statusData.handshake === 'active') {
            badge.className = 'status-badge active';
            badgeText.textContent = 'TUNNEL ACTIVE';
        } else {
            badge.className = 'status-badge inactive';
            badgeText.textContent = 'CONNECTING / STALE';
        }
    } else {
        badge.className = 'status-badge inactive';
        badgeText.textContent = 'TUNNEL DISABLED';
    }

    // 2. Properties
    document.getElementById('val-public-ip').textContent = statusData.public_ip || 'None';
    document.getElementById('val-vpn-port').textContent = statusData.vpn_port || 'None';
    document.getElementById('val-pubkey').textContent = statusData.pubkey || 'None';
    document.getElementById('val-pubkey').title = statusData.pubkey || 'None';
    
    document.getElementById('val-octet').textContent = statusData.internal_octet || 'Unknown';
    // 3. Highlighted guide config parameters
    const ipElements = document.querySelectorAll('.highlight-ip');
    const portElements = document.querySelectorAll('.highlight-port');
    
    ipElements.forEach(el => el.textContent = statusData.public_ip || '<TunnelSats IP>');
    portElements.forEach(el => el.textContent = statusData.vpn_port || '<Forwarding Port>');

    // 4. Expiry / Countdown
    if (countdownInterval) clearInterval(countdownInterval);
    
    const expiryRaw = document.getElementById('expiry-date-raw');
    const timerEl = document.getElementById('countdown-timer');
    const progressEl = document.getElementById('subscription-progress');
    
    if (statusData.expires_at && statusData.expires_at !== 'Unknown') {
        const expiryDate = new Date(statusData.expires_at);
        expiryRaw.textContent = expiryDate.toLocaleString();
        
        // Start countdown
        countdownInterval = setInterval(() => {
            const now = new Date();
            const timeDiff = expiryDate - now;
            
            if (timeDiff <= 0) {
                timerEl.textContent = "Expired";
                timerEl.style.color = '#ff7b72';
                progressEl.style.width = '0%';
                clearInterval(countdownInterval);
            } else {
                const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
                
                if (days > 0) {
                    timerEl.textContent = `${days}d ${hours}h ${minutes}m`;
                } else {
                    timerEl.textContent = `${hours}h ${minutes}m ${seconds}s`;
                }
                
                // Progress Bar (assume 30 days max subscription)
                const maxTerm = 30 * 24 * 60 * 60 * 1000;
                const percentage = Math.min(100, Math.max(0, (timeDiff / maxTerm) * 100));
                progressEl.style.width = `${percentage}%`;
            }
        }, 1000);
    } else {
        expiryRaw.textContent = 'Unconfigured / Inactive';
        timerEl.textContent = 'No Active Subscription';
        progressEl.style.width = '0%';
    }
}

function copyText(elementId, btn) {
    const text = document.getElementById(elementId).title || document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1500);
    });
}

function copyCode(elementId, btn) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied Block!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1500);
    });
}

function switchTab(tabId, btn) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    // Remove active class from buttons
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.classList.remove('active');
    });
    // Show selected tab content
    document.getElementById(tabId).classList.add('active');
    // Set active class on button
    btn.classList.add('active');
}

// Initial fetch and set interval
fetchStatus();
setInterval(fetchStatus, 15000);

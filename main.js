import { createClient } from '@supabase/supabase-js'

// Vite exposes env variables via import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
const adminPasswordBase64 = import.meta.env.VITE_ADMIN_PASSWORD_B64

const supabase = createClient(supabaseUrl, supabaseKey)
const ADMIN_PASSWORD = atob(adminPasswordBase64)

let currentLang = 'en';
let wishlistItems = [];
let editingItemId = null;

function updateModalText() {
    const modalTitle = document.getElementById('modalTitle');
    const btnSave = document.getElementById('btnSave');
    if (editingItemId) {
        modalTitle.setAttribute('data-en', 'Edit wish');
        modalTitle.setAttribute('data-vi', 'Chỉnh sửa điều ước');
        btnSave.setAttribute('data-en', 'Update Wish');
        btnSave.setAttribute('data-vi', 'Cập nhật');
    } else {
        modalTitle.setAttribute('data-en', 'Add a new wish');
        modalTitle.setAttribute('data-vi', 'Thêm điều ước mới');
        btnSave.setAttribute('data-en', 'Save Wish');
        btnSave.setAttribute('data-vi', 'Lưu điều ước');
    }
    if (modalTitle) modalTitle.innerText = modalTitle.getAttribute(`data-${currentLang}`);
    if (btnSave) btnSave.innerText = btnSave.getAttribute(`data-${currentLang}`);
}

// Expose modal functions to global window so HTML onclick can reach them
window.openModal = () => {
    editingItemId = null;
    document.getElementById('wishForm').reset();
    document.getElementById('useValue').innerText = '7 / 10';
    updateModalText();
    document.getElementById('wishModal').style.display = 'flex';
};

window.closeModal = () => {
    document.getElementById('wishModal').style.display = 'none';
    document.getElementById('wishForm').reset();
    document.getElementById('useValue').innerText = '7 / 10';
    editingItemId = null;
    updateModalText();
};

// --- Authentication Wrapper ---
function requirePassword(actionCallback) {
    if (sessionStorage.getItem('admin_unlocked') === 'true') {
        actionCallback();
        return;
    }
    const userInput = prompt("Enter Admin Password to continue:");
    if (userInput === ADMIN_PASSWORD) {
        sessionStorage.setItem('admin_unlocked', 'true');
        actionCallback();
    } else {
        alert("Incorrect password.");
    }
}

function getLocalMeta() {
    return JSON.parse(localStorage.getItem('wishlist_meta') || '{}');
}
function saveLocalMeta(meta) {
    localStorage.setItem('wishlist_meta', JSON.stringify(meta));
}
function persistMeta() {
    const meta = getLocalMeta();
    wishlistItems.forEach((item, index) => {
        item.order_index = index;
        meta[item.id] = {
            order_index: item.order_index,
            gotten: item.gotten || false,
            gotten_how: item.gotten_how || '',
            name: item.name,
            link: item.link,
            usefulness: item.usefulness,
            reason: item.reason
        };
        supabase.from('wishlist').update({
            order_index: item.order_index,
            gotten: item.gotten || false,
            gotten_how: item.gotten_how || '',
            name: item.name,
            link: item.link,
            usefulness: item.usefulness,
            reason: item.reason
        }).eq('id', item.id).then(() => {}).catch(() => {});
    });
    saveLocalMeta(meta);
}

// api/verify.js
export default function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { password } = req.body;
  
  // Set this exact environment variable inside your Vercel Project Settings
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; 

  if (password === ADMIN_PASSWORD) {
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
}

// --- Theme Engine Setup ---
const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', currentTheme);
updateThemeIcon(currentTheme);

document.getElementById('themeToggle').addEventListener('click', () => {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeIcon(theme);
});

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (theme === 'dark') {
        icon.className = 'ph ph-sun';
    } else {
        icon.className = 'ph ph-moon';
    }
}

// --- Translation API (Google GTX + MyMemory Fallback) ---
async function translateText(text, targetLang) {
    if (!text) return text;
    const sourceLang = targetLang === 'vi' ? 'en' : 'vi';

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);

        if (!res.ok) throw new Error(`Google API blocked (Status: ${res.status})`);

        const data = await res.json();
        
        let fullTranslation = "";
        if (data && data[0]) {
            data[0].forEach(sentenceArray => {
                if (sentenceArray[0]) fullTranslation += sentenceArray[0];
            });
            return fullTranslation;
        }
        throw new Error("Unexpected API response format");

    } catch (error) {
        console.warn(`Google Translate failed for "${text}". Trying fallback...`, error);
        
        try {
            const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
            const fallbackRes = await fetch(fallbackUrl);
            const fallbackData = await fallbackRes.json();
            
            if (fallbackData.responseData && fallbackData.responseData.translatedText) {
                return fallbackData.responseData.translatedText;
            }
        } catch (fallbackError) {
            console.error("All translation attempts failed.", fallbackError);
        }
        return text;
    }
}

async function fetchItems() {
    const { data, error } = await supabase.from('wishlist').select('*').order('created_at', { ascending: false });
    if (!error && data) {
        const meta = getLocalMeta();
        wishlistItems = data.map((item, idx) => {
            const itemMeta = meta[item.id] || {};
            return {
                ...item,
                ...(itemMeta.name ? { name: itemMeta.name } : {}),
                ...(itemMeta.link !== undefined ? { link: itemMeta.link } : {}),
                ...(itemMeta.usefulness !== undefined ? { usefulness: itemMeta.usefulness } : {}),
                ...(itemMeta.reason ? { reason: itemMeta.reason } : {}),
                order_index: item.order_index !== undefined && item.order_index !== null ? item.order_index : (itemMeta.order_index !== undefined ? itemMeta.order_index : idx),
                gotten: item.gotten !== undefined && item.gotten !== null ? item.gotten : (itemMeta.gotten || false),
                gotten_how: item.gotten_how !== undefined && item.gotten_how !== null ? item.gotten_how : (itemMeta.gotten_how || '')
            };
        });
        wishlistItems.sort((a, b) => a.order_index - b.order_index);
        renderItems();
    }
}

async function renderItems() {
    const grid = document.getElementById('wishlistGrid');
    
    if (wishlistItems.length === 0) {
        const emptyText = currentLang === 'en' ? "No wishes yet. Add your first one!" : "Chưa có điều ước nào. Hãy thêm một điều!";
        grid.innerHTML = `
            <div class="empty-state" id="emptyState">
                <div class="empty-icon"><i class="ph ph-gift"></i></div>
                <p>${emptyText}</p>
                <button class="btn-outline" onclick="openModal()">+ Add Wish</button>
            </div>
        `;
        return;
    }

    let htmlContent = '';
    const viewLabel = currentLang === 'en' ? 'View item' : 'Xem mục';

    for (const item of wishlistItems) {
        let displayTitle = item.name;
        let displayReason = item.reason;

        if (currentLang === 'vi') {
            displayReason = await translateText(item.reason, 'vi');
        }

        htmlContent += `
            <div class="card ${item.gotten ? 'is-gotten' : ''}">
                <div class="card-header">
                    <div class="title-with-edit">
                        <h3>${displayTitle}</h3>
                        <button class="edit-btn" onclick="editItem('${item.id}')" title="${currentLang === 'en' ? 'Edit wish' : 'Chỉnh sửa'}"><i class="ph ph-pencil-simple"></i></button>
                    </div>
                    <span class="badge">${item.usefulness}/10</span>
                </div>
                <p>${displayReason}</p>
                ${item.gotten ? `
                    <div class="gotten-banner">
                        <i class="ph ph-check-circle-fill"></i>
                        <span><strong>${currentLang === 'en' ? 'Acquired:' : 'Đã có:'}</strong> ${item.gotten_how || (currentLang === 'en' ? 'Got it!' : 'Đã sở hữu!')}</span>
                    </div>
                ` : ''}
                <div class="card-actions">
                    ${item.link ? `<a href="${item.link}" target="_blank"><i class="ph ph-arrow-square-out"></i> ${viewLabel}</a>` : '<span></span>'}
                    <div class="action-buttons">
                        <button class="icon-btn check-btn ${item.gotten ? 'active' : ''}" onclick="toggleGot('${item.id}')" title="${currentLang === 'en' ? 'Mark acquired' : 'Đánh dấu đã có'}"><i class="ph ph-check-circle"></i></button>
                        <button class="icon-btn move-btn" onclick="moveUp('${item.id}')" title="${currentLang === 'en' ? 'Move Up' : 'Chuyển lên'}"><i class="ph ph-arrow-up"></i></button>
                        <button class="icon-btn move-btn" onclick="moveDown('${item.id}')" title="${currentLang === 'en' ? 'Move Down' : 'Chuyển xuống'}"><i class="ph ph-arrow-down"></i></button>
                        <button class="icon-btn delete-btn" onclick="deleteItem('${item.id}')" title="${currentLang === 'en' ? 'Delete' : 'Xóa'}"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
    }
    grid.innerHTML = htmlContent;
}

// --- Interactions ---
document.getElementById('wishForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const rawLink = document.getElementById('itemLink').value.trim();
    const itemData = {
        name: document.getElementById('itemName').value.trim(),
        link: rawLink ? rawLink : null,
        usefulness: parseInt(document.getElementById('itemUsefulness').value),
        reason: document.getElementById('itemReason').value.trim()
    };

    if (editingItemId !== null) {
        const idx = wishlistItems.findIndex(i => String(i.id) === String(editingItemId));
        if (idx !== -1) {
            wishlistItems[idx] = { ...wishlistItems[idx], ...itemData };
        }
        persistMeta();
        renderItems();
        window.closeModal();

        supabase.from('wishlist').update(itemData).eq('id', editingItemId).then(({ error }) => {
            if (error) console.warn("Supabase update error:", error.message);
        });
    } else {
        requirePassword(async () => {
            const { error } = await supabase.from('wishlist').insert([itemData]);
            if (!error) {
                window.closeModal();
                fetchItems();
            } else {
                alert("Failed to add item.");
            }
        });
    }
});

window.editItem = (id) => {
    requirePassword(() => {
        const item = wishlistItems.find(i => String(i.id) === String(id));
        if (!item) return;

        editingItemId = id;
        document.getElementById('itemName').value = item.name || '';
        document.getElementById('itemLink').value = item.link || '';
        document.getElementById('itemUsefulness').value = item.usefulness || 7;
        document.getElementById('useValue').innerText = (item.usefulness || 7) + ' / 10';
        document.getElementById('itemReason').value = item.reason || '';

        updateModalText();
        document.getElementById('wishModal').style.display = 'flex';
    });
};

window.moveUp = (id) => {
    requirePassword(() => {
        const idx = wishlistItems.findIndex(i => String(i.id) === String(id));
        if (idx <= 0) return;

        const tempOrder = wishlistItems[idx].order_index;
        wishlistItems[idx].order_index = wishlistItems[idx - 1].order_index;
        wishlistItems[idx - 1].order_index = tempOrder;

        if (wishlistItems[idx].order_index === wishlistItems[idx - 1].order_index) {
            wishlistItems[idx].order_index = idx - 1;
            wishlistItems[idx - 1].order_index = idx;
        }

        wishlistItems.sort((a, b) => a.order_index - b.order_index);
        persistMeta();
        renderItems();
    });
};

window.moveDown = (id) => {
    requirePassword(() => {
        const idx = wishlistItems.findIndex(i => String(i.id) === String(id));
        if (idx === -1 || idx >= wishlistItems.length - 1) return;

        const tempOrder = wishlistItems[idx].order_index;
        wishlistItems[idx].order_index = wishlistItems[idx + 1].order_index;
        wishlistItems[idx + 1].order_index = tempOrder;

        if (wishlistItems[idx].order_index === wishlistItems[idx + 1].order_index) {
            wishlistItems[idx].order_index = idx + 1;
            wishlistItems[idx + 1].order_index = idx;
        }

        wishlistItems.sort((a, b) => a.order_index - b.order_index);
        persistMeta();
        renderItems();
    });
};

window.toggleGot = (id) => {
    requirePassword(() => {
        const item = wishlistItems.find(i => String(i.id) === String(id));
        if (!item) return;

        if (item.gotten) {
            if (confirm(currentLang === 'en' ? "Unmark this item as acquired?" : "Bỏ đánh dấu đã sở hữu món đồ này?")) {
                item.gotten = false;
                item.gotten_how = '';
                persistMeta();
                renderItems();
            }
        } else {
            const promptMsg = currentLang === 'en' ? "Awesome! How did you get this item?" : "Tuyệt vời! Bạn đã có món đồ này bằng cách nào?";
            const howGot = prompt(promptMsg, currentLang === 'en' ? "Bought it / Gift" : "Đã mua / Được tặng");
            if (howGot !== null) {
                item.gotten = true;
                item.gotten_how = howGot;
                persistMeta();
                renderItems();
            }
        }
    });
};

window.deleteItem = (id) => {
    requirePassword(async () => {
        const { error } = await supabase.from('wishlist').delete().eq('id', id);
        if (!error) fetchItems();
    });
};

document.getElementById('langToggle').addEventListener('click', () => {
    currentLang = currentLang === 'en' ? 'vi' : 'en';
    
    document.getElementById('langText').innerText = currentLang === 'en' ? 'Tiếng Việt' : 'English';
    
    const staticIds = ['mainTitle', 'subTitle', 'modalTitle', 'lblItem', 'lblLink', 'lblUse', 'lblUseSub', 'lblReason', 'btnCancel', 'btnSave'];
    
    staticIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = el.getAttribute(`data-${currentLang}`);
    });

    renderItems();
});

// Init
fetchItems();

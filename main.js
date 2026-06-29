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
    const userInput = prompt("Enter Admin Password to continue:");
    if (userInput === ADMIN_PASSWORD) {
        actionCallback();
    } else {
        alert("Incorrect password.");
    }
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

// --- Fetch & Render ---
async function fetchItems() {
    const { data, error } = await supabase.from('wishlist').select('*').order('created_at', { ascending: false });
    if (!error) {
        wishlistItems = data;
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
            <div class="card">
                <div class="card-header">
                    <div class="title-with-edit">
                        <h3>${displayTitle}</h3>
                        <button class="edit-btn" onclick="editItem(${item.id})" title="${currentLang === 'en' ? 'Edit wish' : 'Chỉnh sửa'}"><i class="ph ph-pencil-simple"></i></button>
                    </div>
                    <span class="badge">${item.usefulness}/10</span>
                </div>
                <p>${displayReason}</p>
                <div class="card-actions">
                    ${item.link ? `<a href="${item.link}" target="_blank"><i class="ph ph-arrow-square-out"></i> ${viewLabel}</a>` : '<span></span>'}
                    <button class="delete-btn" onclick="deleteItem(${item.id})"><i class="ph ph-trash"></i></button>
                </div>
            </div>
        `;
    }
    grid.innerHTML = htmlContent;
}

// --- Interactions ---
document.getElementById('wishForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const itemData = {
        name: document.getElementById('itemName').value,
        link: document.getElementById('itemLink').value,
        usefulness: parseInt(document.getElementById('itemUsefulness').value),
        reason: document.getElementById('itemReason').value
    };

    if (editingItemId !== null) {
        (async () => {
            const { error } = await supabase.from('wishlist').update(itemData).eq('id', editingItemId);
            if (!error) {
                window.closeModal();
                fetchItems();
            } else {
                alert("Failed to update item.");
            }
        })();
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
        const item = wishlistItems.find(i => i.id === id);
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

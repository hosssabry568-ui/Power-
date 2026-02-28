/* ============================================================
   مصحف النور — نظام Firebase الشامل
   ✅ Streak المداومة  ✅ تتبع الختمة  ✅ آية اليوم المخصصة
   ✅ شارات الإنجازات  ✅ مزامنة السحابة
   
   طريقة الإضافة للـ index.html:
   أضف هذا السطر قبل إغلاق </body>:
   <script src="firebase-system.js"></script>
   
   تأكد إن Firebase مهيّأ قبله بهذا الكود:
   <script type="module">
     import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
     import { getDatabase, ref, set, onValue, get, push, update } 
       from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
     const cfg = { ...your config... };
     const app = initializeApp(cfg);
     const db = getDatabase(app);
     window._fb = { db, ref, set, onValue, get, push, update };
   </script>
============================================================ */

/* ============================================================
   ١. مُعرِّف المستخدم — يُنشئ ID مجهول ويخزنه
============================================================ */
(function() {
'use strict';

// ─── User ID ───────────────────────────────────────────────
function getUserId() {
  let uid = localStorage.getItem('_noor_uid');
  if (!uid) {
    uid = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('_noor_uid', uid);
  }
  return uid;
}
const UID = getUserId();
const DB_PATH = `users/${UID}`;

// ─── الأرقام العربية ────────────────────────────────────────
function toArabic(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

// ─── Toast helper ───────────────────────────────────────────
function notify(msg, duration = 3000) {
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), duration);
  }
}

// ─── انتظار Firebase ────────────────────────────────────────
function waitForFirebase(cb, retries = 20) {
  if (window._fb) { cb(window._fb); return; }
  if (retries <= 0) { console.warn('[Firebase] لم يتم الاتصال'); return; }
  setTimeout(() => waitForFirebase(cb, retries - 1), 200);
}

/* ============================================================
   ٢. نظام Streak المداومة
============================================================ */
const STREAK = {
  data: {
    current: 0,
    longest: 0,
    lastDate: null,
    totalDays: 0
  },

  // تحميل البيانات من localStorage أولاً ثم Firebase
  load() {
    try {
      const local = JSON.parse(localStorage.getItem('_streak') || 'null');
      if (local) this.data = local;
    } catch(e) {}

    waitForFirebase(({ db, ref, get }) => {
      get(ref(db, `${DB_PATH}/streak`)).then(snap => {
        if (snap.exists()) {
          const remote = snap.val();
          // خذ الأعلى بين المحلي والبعيد
          if ((remote.current || 0) >= this.data.current) {
            this.data = remote;
            localStorage.setItem('_streak', JSON.stringify(this.data));
          }
        }
        this.render();
      }).catch(() => this.render());
    });
  },

  // سجّل يوم قراءة
  recordToday() {
    const today = new Date().toDateString();
    if (this.data.lastDate === today) return; // سبق تسجيله

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    if (this.data.lastDate === yesterday) {
      this.data.current += 1; // متتالي
    } else {
      this.data.current = 1; // بدء من جديد
    }

    this.data.lastDate = today;
    this.data.totalDays = (this.data.totalDays || 0) + 1;
    if (this.data.current > (this.data.longest || 0)) {
      this.data.longest = this.data.current;
    }

    localStorage.setItem('_streak', JSON.stringify(this.data));

    // حفظ في Firebase
    waitForFirebase(({ db, ref, set }) => {
      set(ref(db, `${DB_PATH}/streak`), this.data);
    });

    this.render();
    this.checkMilestones();
    ACHIEVEMENTS.check();
  },

  // عرض الـ Streak في الصفحة الرئيسية
  render() {
    // تحديث stat-days الموجود
    const daysEl = document.getElementById('stat-days');
    if (daysEl) {
      daysEl.textContent = toArabic(this.data.current || 0);
      const lbl = daysEl.nextElementSibling;
      if (lbl) lbl.textContent = 'يوم متتالي 🔥';
    }

    // تحديث بطاقة Streak لو موجودة
    const streakCard = document.getElementById('streak-card');
    if (streakCard) {
      streakCard.querySelector('.streak-num').textContent = toArabic(this.data.current || 0);
      streakCard.querySelector('.streak-longest').textContent = `الأطول: ${toArabic(this.data.longest || 0)} يوم`;
      streakCard.querySelector('.streak-total').textContent = `الإجمالي: ${toArabic(this.data.totalDays || 0)} يوم`;
    }
  },

  // تحقق من المعالم
  checkMilestones() {
    const milestones = {
      3:  '🌱 ثلاثة أيام متتالية! استمر!',
      7:  '🌟 أسبوع كامل! ماشاء الله!',
      14: '💫 أسبوعان! أنت مداوم حقيقي!',
      30: '🏆 ثلاثون يوماً! شهر كامل من القراءة!',
      60: '👑 ستون يوماً! سبحان الله!',
      100:'✨ مئة يوم! بارك الله فيك!'
    };
    const msg = milestones[this.data.current];
    if (msg) notify(msg, 5000);
  }
};

/* ============================================================
   ٣. تتبع الختمة
============================================================ */
const KHATMA = {
  data: {
    startDate: null,
    completedPages: {},   // { "page_X": timestamp }
    completedJuz: {},     // { "juz_X": timestamp }
    completedSurahs: {},  // { "surah_X": timestamp }
    targetDays: 30,
    completions: 0
  },

  TOTAL_PAGES: 604,
  TOTAL_JUZ: 30,
  TOTAL_SURAHS: 114,

  load() {
    try {
      const local = JSON.parse(localStorage.getItem('_khatma') || 'null');
      if (local) this.data = local;
    } catch(e) {}

    waitForFirebase(({ db, ref, get }) => {
      get(ref(db, `${DB_PATH}/khatma`)).then(snap => {
        if (snap.exists()) {
          this.data = { ...this.data, ...snap.val() };
          localStorage.setItem('_khatma', JSON.stringify(this.data));
        }
        this.render();
      }).catch(() => this.render());
    });
  },

  // بدء ختمة جديدة
  start(targetDays = 30) {
    this.data = {
      startDate: Date.now(),
      completedPages: {},
      completedJuz: {},
      completedSurahs: {},
      targetDays,
      completions: this.data.completions || 0
    };
    this.save();
    notify(`✅ بدأت ختمة جديدة! الهدف: ${toArabic(targetDays)} يوم`, 3000);
    this.render();
  },

  // تسجيل قراءة سورة
  markSurah(surahId, surahName) {
    if (!this.data.startDate) this.start();
    this.data.completedSurahs[`s_${surahId}`] = Date.now();
    
    // حساب الجزء
    const juzMap = this.getJuzForSurah(surahId);
    if (juzMap) this.data.completedJuz[`j_${juzMap}`] = Date.now();

    this.save();
    this.render();
    this.checkKhatmaComplete();

    // سجّل في الـ Streak
    STREAK.recordToday();
  },

  // نسبة إتمام الختمة
  getProgress() {
    const done = Object.keys(this.data.completedSurahs).length;
    return {
      surahs: done,
      percent: Math.round((done / this.TOTAL_SURAHS) * 100),
      juz: Object.keys(this.data.completedJuz).length,
      daysLeft: this.getDaysLeft()
    };
  },

  getDaysLeft() {
    if (!this.data.startDate) return this.data.targetDays;
    const elapsed = Math.floor((Date.now() - this.data.startDate) / 86400000);
    return Math.max(0, this.data.targetDays - elapsed);
  },

  checkKhatmaComplete() {
    if (Object.keys(this.data.completedSurahs).length >= this.TOTAL_SURAHS) {
      this.data.completions = (this.data.completions || 0) + 1;
      this.data.completedSurahs = {};
      this.data.completedJuz = {};
      this.data.startDate = Date.now();
      this.save();
      notify(`🏆 مبارك! أتممت الختمة رقم ${toArabic(this.data.completions)}! `, 6000);
      ACHIEVEMENTS.check();
    }
  },

  getJuzForSurah(surahId) {
    // تعيين السور للأجزاء (مبسّط)
    const juzBoundaries = [
      2,9,17,25,35,42,50,56,62,72,76,83,88,92,97,
      100,104,108,112,116,120,124,128,132,136,140,144,149,154,114
    ];
    for (let i = 0; i < juzBoundaries.length; i++) {
      if (surahId <= juzBoundaries[i]) return i + 1;
    }
    return 30;
  },

  save() {
    localStorage.setItem('_khatma', JSON.stringify(this.data));
    waitForFirebase(({ db, ref, set }) => {
      set(ref(db, `${DB_PATH}/khatma`), this.data);
    });
  },

  // عرض شريط التقدم
  render() {
    const p = this.getProgress();
    
    // تحديث الإحصائيات في الصفحة الرئيسية
    const khatmaBar = document.getElementById('khatma-progress-bar');
    if (khatmaBar) {
      khatmaBar.querySelector('.kp-fill').style.width = p.percent + '%';
      khatmaBar.querySelector('.kp-surahs').textContent = `${toArabic(p.surahs)}/${toArabic(this.TOTAL_SURAHS)}`;
      khatmaBar.querySelector('.kp-percent').textContent = toArabic(p.percent) + '%';
      khatmaBar.querySelector('.kp-juz').textContent = `الأجزاء: ${toArabic(p.juz)}/${toArabic(this.TOTAL_JUZ)}`;
      khatmaBar.querySelector('.kp-days').textContent = `باقي: ${toArabic(p.daysLeft)} يوم`;
    }
  }
};

/* ============================================================
   ٤. آية اليوم المخصصة
============================================================ */
const AYAH_OF_DAY = {
  TOPICS: {
    'الصبر':    [2,155, 3,200, 39,10, 31,17, 16,127],
    'الرزق':    [2,212, 51,22, 65,3, 11,6, 29,60],
    'الشكر':    [14,7, 31,12, 27,40, 39,66, 16,114],
    'الدعاء':   [2,186, 40,60, 27,62, 7,29, 11,61],
    'التوبة':   [39,53, 4,110, 66,8, 3,135, 25,70],
    'الأمل':    [94,5, 65,7, 2,286, 12,87, 13,11],
    'الحب':     [3,159, 5,54, 2,165, 19,96, 30,21],
    'الإخلاص': [112,1, 98,5, 4,125, 6,162, 39,2]
  },

  preferredTopic: null,

  load() {
    this.preferredTopic = localStorage.getItem('_ayahTopic') || 'الصبر';
    const today = new Date().toDateString();
    const cached = JSON.parse(localStorage.getItem('_ayahDay') || 'null');
    
    if (cached && cached.date === today && cached.topic === this.preferredTopic) {
      this.render(cached);
      return;
    }
    this.fetch();
  },

  async fetch() {
    const topic = this.preferredTopic || 'الصبر';
    const pool = this.TOPICS[topic] || this.TOPICS['الصبر'];
    
    // اختر آية عشوائية من الموضوع بناءً على اليوم
    const dayIndex = new Date().getDate() % (pool.length / 2);
    const surah = pool[dayIndex * 2];
    const ayah = pool[dayIndex * 2 + 1];
    
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}`);
      const d = await r.json();
      if (d.data) {
        const ayahData = {
          text: d.data.text,
          surahName: d.data.surah.name,
          surahId: surah,
          ayahNum: ayah,
          topic,
          date: new Date().toDateString()
        };
        localStorage.setItem('_ayahDay', JSON.stringify(ayahData));
        this.render(ayahData);
      }
    } catch(e) {
      // offline — عرض آية من الـ cache القديمة
      const old = JSON.parse(localStorage.getItem('_ayahDay') || 'null');
      if (old) this.render(old);
    }
  },

  setTopic(topic) {
    this.preferredTopic = topic;
    localStorage.setItem('_ayahTopic', topic);
    this.fetch();
  },

  render(data) {
    const card = document.getElementById('ayah-day-card');
    if (!card || !data) return;
    card.querySelector('.ayd-topic').textContent = '📖 موضوع: ' + data.topic;
    card.querySelector('.ayd-text').textContent = data.text;
    card.querySelector('.ayd-ref').textContent = `سورة ${data.surahName} - آية ${toArabic(data.ayahNum)}`;
  }
};

/* ============================================================
   ٥. نظام الإنجازات والشارات
============================================================ */
const ACHIEVEMENTS = {
  list: [
    { id: 'first_day',   title: 'أول يوم', icon: '🌱', desc: 'سجّلت أول يوم قراءة',          check: () => STREAK.data.totalDays >= 1 },
    { id: 'week_streak', title: 'أسبوع',   icon: '⭐', desc: 'أسبوع متتالي من القراءة',        check: () => STREAK.data.current >= 7 },
    { id: 'month_read',  title: 'شهر',     icon: '🏅', desc: 'ثلاثون يوماً متتالية',            check: () => STREAK.data.current >= 30 },
    { id: 'first_juz',   title: 'جزء كامل',icon: '📖', desc: 'أكملت جزءاً من القرآن',          check: () => Object.keys(KHATMA.data.completedJuz || {}).length >= 1 },
    { id: 'half_quran',  title: 'نصف القرآن', icon: '🌟', desc: 'قرأت نصف القرآن',            check: () => Object.keys(KHATMA.data.completedSurahs || {}).length >= 57 },
    { id: 'khatma_1',    title: 'ختمة كاملة', icon: '🏆', desc: 'أتممت ختمة قرآن كاملة',     check: () => (KHATMA.data.completions || 0) >= 1 },
    { id: 'khatma_3',    title: '٣ ختمات',  icon: '👑', desc: 'أتممت ٣ ختمات قرآنية',         check: () => (KHATMA.data.completions || 0) >= 3 }
  ],

  unlocked: {},

  load() {
    try {
      this.unlocked = JSON.parse(localStorage.getItem('_achievements') || '{}');
    } catch(e) {}
  },

  check() {
    this.list.forEach(a => {
      if (!this.unlocked[a.id] && a.check()) {
        this.unlock(a);
      }
    });
  },

  unlock(achievement) {
    this.unlocked[achievement.id] = Date.now();
    localStorage.setItem('_achievements', JSON.stringify(this.unlocked));
    
    // حفظ في Firebase
    waitForFirebase(({ db, ref, set }) => {
      set(ref(db, `${DB_PATH}/achievements/${achievement.id}`), Date.now());
    });

    // عرض إشعار الإنجاز
    this.showUnlockToast(achievement);
  },

  showUnlockToast(a) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
      background:linear-gradient(135deg,#0d3d26,#062115);
      border:2px solid #d4af37; border-radius:16px;
      padding:14px 20px; z-index:99999;
      font-family:'Amiri',serif; text-align:center;
      box-shadow:0 8px 30px rgba(0,0,0,.5);
      animation:achievSlide .4s ease;
      min-width:200px;
    `;
    toast.innerHTML = `
      <div style="font-size:2em;margin-bottom:4px">${a.icon}</div>
      <div style="color:#d4af37;font-weight:bold;font-size:1em">إنجاز جديد!</div>
      <div style="color:#fff;font-size:.9em;margin-top:2px">${a.title}</div>
      <div style="color:rgba(255,255,255,.6);font-size:.78em;margin-top:3px">${a.desc}</div>
    `;

    const style = document.createElement('style');
    style.textContent = '@keyframes achievSlide{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(style);

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  },

  getCount() {
    return Object.keys(this.unlocked).length;
  }
};

/* ============================================================
   ٦. بطاقات واجهة المستخدم — تُضاف للصفحة الرئيسية
============================================================ */
function injectUI() {
  // ابحث عن stats-bar وأضف البطاقات فوقه
  const statsBar = document.getElementById('stats-bar');
  if (!statsBar || document.getElementById('firebase-section')) return;

  const section = document.createElement('div');
  section.id = 'firebase-section';
  section.style.cssText = 'padding:0 14px;';

  section.innerHTML = `
    <!-- ═══ بطاقة Streak ═══ -->
    <div id="streak-card" style="
      background:linear-gradient(135deg,#0d3d26,#062115);
      border:1.5px solid rgba(212,175,55,.4);
      border-radius:18px; padding:14px 16px; margin-bottom:10px;
      display:flex; align-items:center; gap:14px; cursor:pointer;
    " onclick="FIREBASE_SYS.showStreakDetail()">
      <div style="font-size:2.6em; filter:drop-shadow(0 2px 6px rgba(255,150,0,.3))">🔥</div>
      <div style="flex:1">
        <div style="display:flex;align-items:baseline;gap:6px">
          <span class="streak-num" style="font-size:2em;font-weight:bold;color:#d4af37;line-height:1">٠</span>
          <span style="color:rgba(255,255,255,.6);font-size:.8em">يوم متتالي</span>
        </div>
        <div style="display:flex;gap:12px;margin-top:3px">
          <span class="streak-longest" style="color:rgba(212,175,55,.6);font-size:.72em">الأطول: ٠ يوم</span>
          <span class="streak-total" style="color:rgba(212,175,55,.6);font-size:.72em">الإجمالي: ٠ يوم</span>
        </div>
      </div>
      <div id="achievements-badge" style="
        background:rgba(212,175,55,.15); border:1px solid rgba(212,175,55,.3);
        border-radius:50%; width:36px; height:36px;
        display:flex;align-items:center;justify-content:center;
        font-size:.78em;color:#d4af37;font-weight:bold;flex-shrink:0;
      ">🏅</div>
    </div>

    <!-- ═══ شريط تقدم الختمة ═══ -->
    <div id="khatma-progress-bar" style="
      background:var(--card); border:1px solid rgba(212,175,55,.16);
      border-radius:16px; padding:12px 14px; margin-bottom:10px;
      cursor:pointer;
    " onclick="FIREBASE_SYS.showKhatmaDetail()">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="color:#d4af37;font-size:.85em;font-weight:bold">📚 تقدم الختمة</span>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="kp-surahs" style="color:rgba(255,255,255,.5);font-size:.75em">٠/١١٤</span>
          <span class="kp-percent" style="color:#d4af37;font-size:.85em;font-weight:bold">٠%</span>
        </div>
      </div>
      <div style="height:8px;background:rgba(212,175,55,.1);border-radius:6px;overflow:hidden">
        <div class="kp-fill" style="height:100%;background:linear-gradient(90deg,#2d9e6b,#d4af37);border-radius:6px;width:0%;transition:width .6s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:7px">
        <span class="kp-juz" style="color:rgba(212,175,55,.6);font-size:.72em">الأجزاء: ٠/٣٠</span>
        <span class="kp-days" style="color:rgba(212,175,55,.6);font-size:.72em">باقي: ٣٠ يوم</span>
      </div>
    </div>

    <!-- ═══ آية اليوم ═══ -->
    <div id="ayah-day-card" style="
      background:linear-gradient(135deg,#041a0e,#0b2b1d);
      border:1px solid rgba(212,175,55,.2);
      border-radius:16px; padding:14px 16px; margin-bottom:10px;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span class="ayd-topic" style="color:rgba(212,175,55,.7);font-size:.75em">📖 آية اليوم</span>
        <select id="ayah-topic-select" style="
          background:rgba(212,175,55,.1); border:1px solid rgba(212,175,55,.3);
          color:#d4af37; border-radius:8px; padding:3px 8px; font-family:'Amiri';
          font-size:.75em; cursor:pointer; outline:none;
        " onchange="FIREBASE_SYS.setTopic(this.value)">
          <option value="الصبر">الصبر</option>
          <option value="الرزق">الرزق</option>
          <option value="الشكر">الشكر</option>
          <option value="الدعاء">الدعاء</option>
          <option value="التوبة">التوبة</option>
          <option value="الأمل">الأمل</option>
          <option value="الحب">الحب</option>
          <option value="الإخلاص">الإخلاص</option>
        </select>
      </div>
      <div class="ayd-text" style="
        font-family:'Noto Naskh Arabic',serif; font-size:clamp(1em,4.2vw,1.18em);
        line-height:2.1; color:var(--text); direction:rtl;
      ">⏳ جاري التحميل...</div>
      <div class="ayd-ref" style="color:rgba(212,175,55,.6);font-size:.75em;margin-top:8px;text-align:left;direction:ltr"></div>
    </div>
  `;

  statsBar.parentNode.insertBefore(section, statsBar);

  // تعيين الموضوع المحفوظ في الـ select
  const sel = document.getElementById('ayah-topic-select');
  if (sel) sel.value = localStorage.getItem('_ayahTopic') || 'الصبر';
}

/* ============================================================
   ٧. نافذة تفاصيل الـ Streak
============================================================ */
function showStreakDetail() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99998;
    display:flex;align-items:flex-end;justify-content:center;
    backdrop-filter:blur(4px);
  `;

  const achHTML = ACHIEVEMENTS.list.map(a => `
    <div style="
      display:flex;align-items:center;gap:12px;
      padding:10px 0;border-bottom:1px solid rgba(212,175,55,.08);
      opacity:${ACHIEVEMENTS.unlocked[a.id] ? 1 : 0.35};
    ">
      <span style="font-size:1.8em">${a.icon}</span>
      <div>
        <div style="color:#d4af37;font-weight:bold;font-size:.88em">${a.title}</div>
        <div style="color:rgba(255,255,255,.5);font-size:.75em">${a.desc}</div>
      </div>
      ${ACHIEVEMENTS.unlocked[a.id] ? '<span style="margin-right:auto;color:#2d9e6b;font-size:1.1em">✓</span>' : ''}
    </div>
  `).join('');

  modal.innerHTML = `
    <div style="
      background:var(--card, #fff);
      border-radius:24px 24px 0 0;
      padding:20px 18px 40px;
      max-height:80vh; overflow-y:auto;
      width:100%;
      font-family:'Amiri',serif;
      border-top:2px solid #d4af37;
    ">
      <div style="width:40px;height:4px;background:rgba(136,136,136,.3);border-radius:2px;margin:0 auto 18px;cursor:pointer" onclick="this.closest('[style*=fixed]').remove()"></div>
      
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:3.5em">🔥</div>
        <div style="font-size:2.5em;font-weight:bold;color:#d4af37">${toArabic(STREAK.data.current || 0)}</div>
        <div style="color:rgba(255,255,255,.6)">يوم متتالي</div>
        <div style="display:flex;justify-content:center;gap:24px;margin-top:14px">
          <div style="text-align:center">
            <div style="font-size:1.5em;font-weight:bold;color:#d4af37">${toArabic(STREAK.data.longest || 0)}</div>
            <div style="font-size:.75em;color:rgba(255,255,255,.5)">الأطول</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.5em;font-weight:bold;color:#d4af37">${toArabic(STREAK.data.totalDays || 0)}</div>
            <div style="font-size:.75em;color:rgba(255,255,255,.5)">إجمالي الأيام</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.5em;font-weight:bold;color:#d4af37">${toArabic(KHATMA.data.completions || 0)}</div>
            <div style="font-size:.75em;color:rgba(255,255,255,.5)">ختمة كاملة</div>
          </div>
        </div>
      </div>

      <div style="color:#d4af37;font-weight:bold;margin-bottom:10px">🏅 الإنجازات (${toArabic(ACHIEVEMENTS.getCount())}/${toArabic(ACHIEVEMENTS.list.length)})</div>
      ${achHTML}
      
      <button onclick="this.closest('[style*=fixed]').remove()" style="
        width:100%;margin-top:16px;padding:13px;
        background:#d4af37;color:#062115;
        border:none;border-radius:14px;
        font-family:'Amiri';font-size:1em;font-weight:bold;cursor:pointer;
      ">إغلاق</button>
    </div>
  `;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

/* ============================================================
   ٨. نافذة تفاصيل الختمة
============================================================ */
function showKhatmaDetail() {
  const p = KHATMA.getProgress();
  const modal = document.createElement('div');
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99998;
    display:flex;align-items:flex-end;justify-content:center;
    backdrop-filter:blur(4px);
  `;

  modal.innerHTML = `
    <div style="
      background:var(--card,#fff); border-radius:24px 24px 0 0;
      padding:20px 18px 40px; max-height:80vh; overflow-y:auto;
      width:100%; font-family:'Amiri',serif; border-top:2px solid #d4af37;
    ">
      <div style="width:40px;height:4px;background:rgba(136,136,136,.3);border-radius:2px;margin:0 auto 18px;cursor:pointer" onclick="this.closest('[style*=fixed]').remove()"></div>
      
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-size:2em">📚</div>
        <div style="font-size:1.8em;font-weight:bold;color:#d4af37">${toArabic(p.percent)}%</div>
        <div style="color:rgba(255,255,255,.6);font-size:.85em">${toArabic(p.surahs)} سورة من ${toArabic(KHATMA.TOTAL_SURAHS)}</div>
        <div style="height:10px;background:rgba(212,175,55,.1);border-radius:6px;overflow:hidden;margin:12px 0">
          <div style="height:100%;background:linear-gradient(90deg,#2d9e6b,#d4af37);border-radius:6px;width:${p.percent}%;transition:width 1s"></div>
        </div>
        <div style="display:flex;justify-content:center;gap:20px">
          <div style="text-align:center">
            <div style="color:#d4af37;font-weight:bold">${toArabic(p.juz)}/${toArabic(KHATMA.TOTAL_JUZ)}</div>
            <div style="font-size:.72em;color:rgba(255,255,255,.5)">أجزاء</div>
          </div>
          <div style="text-align:center">
            <div style="color:#d4af37;font-weight:bold">${toArabic(p.daysLeft)}</div>
            <div style="font-size:.72em;color:rgba(255,255,255,.5)">يوم متبقي</div>
          </div>
          <div style="text-align:center">
            <div style="color:#d4af37;font-weight:bold">${toArabic(KHATMA.data.completions || 0)}</div>
            <div style="font-size:.72em;color:rgba(255,255,255,.5)">ختمة أُتمّت</div>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button onclick="FIREBASE_SYS.startKhatma(30);this.closest('[style*=fixed]').remove()" style="
          flex:1;padding:11px;background:rgba(212,175,55,.15);
          border:1.5px solid rgba(212,175,55,.4);color:#d4af37;
          border-radius:12px;font-family:'Amiri';font-size:.9em;cursor:pointer;
        ">🔄 ختمة في شهر</button>
        <button onclick="FIREBASE_SYS.startKhatma(7);this.closest('[style*=fixed]').remove()" style="
          flex:1;padding:11px;background:rgba(212,175,55,.15);
          border:1.5px solid rgba(212,175,55,.4);color:#d4af37;
          border-radius:12px;font-family:'Amiri';font-size:.9em;cursor:pointer;
        ">⚡ ختمة في أسبوع</button>
      </div>

      <button onclick="this.closest('[style*=fixed]').remove()" style="
        width:100%;padding:13px;background:#d4af37;color:#062115;
        border:none;border-radius:14px;
        font-family:'Amiri';font-size:1em;font-weight:bold;cursor:pointer;
      ">إغلاق</button>
    </div>
  `;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

/* ============================================================
   ٩. الدمج مع الكود الأصلي — hook في renderAyahs
============================================================ */
function hookIntoApp() {
  // سجّل قراءة السورة بعد تحميلها
  const _origRenderAyahs = window.renderAyahs;
  if (_origRenderAyahs) {
    window.renderAyahs = async function(surahId, surahName, ...args) {
      const result = await _origRenderAyahs.call(this, surahId, surahName, ...args);
      // سجّل القراءة بعد 5 ثواني (يعني فعلاً فتح السورة)
      setTimeout(() => {
        KHATMA.markSurah(surahId, surahName);
        STREAK.recordToday();
        // تحديث badge الإنجازات
        const badge = document.getElementById('achievements-badge');
        if (badge) badge.textContent = `${ACHIEVEMENTS.getCount()}/${ACHIEVEMENTS.list.length}`;
      }, 5000);
      return result;
    };
  }
}

/* ============================================================
   ١٠. API عام — window.FIREBASE_SYS
============================================================ */
window.FIREBASE_SYS = {
  // يُستدعى من أي مكان في التطبيق
  recordReading: (surahId, surahName) => KHATMA.markSurah(surahId, surahName),
  showStreakDetail,
  showKhatmaDetail,
  startKhatma: (days) => KHATMA.start(days),
  setTopic: (topic) => AYAH_OF_DAY.setTopic(topic),
  getStreak: () => STREAK.data,
  getKhatmaProgress: () => KHATMA.getProgress(),

  // تُستدعى يدوياً للاختبار
  debugUnlockAll: () => {
    ACHIEVEMENTS.list.forEach(a => ACHIEVEMENTS.unlock(a));
    notify('🎉 كل الإنجازات مفتوحة! (وضع الاختبار)', 3000);
  }
};

/* ============================================================
   ١١. تهيئة عند تحميل الصفحة
============================================================ */
function init() {
  ACHIEVEMENTS.load();
  STREAK.load();
  KHATMA.load();
  injectUI();
  
  setTimeout(() => {
    AYAH_OF_DAY.load();
    hookIntoApp();
    ACHIEVEMENTS.check();
    
    // تحديث badge
    const badge = document.getElementById('achievements-badge');
    if (badge) badge.textContent = `${ACHIEVEMENTS.getCount()}/${ACHIEVEMENTS.list.length}`;
  }, 1000);
}

// انتظر تحميل الصفحة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  setTimeout(init, 500);
}

})(); // IIFE end

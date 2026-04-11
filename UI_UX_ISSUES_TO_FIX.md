# UI/UX Issues To Fix — Ayush's Settlement Portfolio

**Date:** April 11, 2026, 12 PM IST  
**Status:** 🔴 **CRITICAL** - Multiple usability issues found in light mode  
**Reporter:** User QA Testing  
**Priority:** HIGH

---

## 🔴 CRITICAL ISSUES (Light Mode)

### 1. ❌ **Building Names Unreadable in Light Mode**
**Location:** Main Street buildings  
**Problem:** Building name text color (beige/tan) blends with beige background  
**Affected Buildings:** All Main Street buildings (Drone Repair Workshop, ACE Concierge, Tiny Tots Academy, The Ledger's Edge, etc.)  
**Fix Required:**
```css
/* Add to portfolio.html CSS section */
[data-theme="day"] .building-label,
[data-theme="day"] .building span {
  color: #3a1f04 !important; /* Dark brown for contrast */
  text-shadow: 1px 1px 2px rgba(255,255,255,0.8); /* White shadow for legibility */
  font-weight: 600;
}
```

---

### 2. ❌ **No Horizontal Scroll for Buildings**
**Location:** Main Street buildings container  
**Problem:** Only 4-4.5 buildings visible on 15.6" laptop screen, remaining buildings (6-9) completely hidden  
**Impact:** Buildings 6-9 are inaccessible  
**Fix Required:**
```css
/* Modify .street CSS in portfolio.html */
.street {
  display: flex;
  align-items: flex-end;
  gap: 0rem;
  padding: var(--space-lg) var(--space-2xl);
  /* ADD THESE PROPERTIES: */
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  white-space: nowrap;
}

/* Add scrollbar styling */
.street::-webkit-scrollbar {
  height: 10px;
}

.street::-webkit-scrollbar-track {
  background: rgba(0,0,0,0.1);
  border-radius: 5px;
}

.street::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 5px;
}

.street::-webkit-scrollbar-thumb:hover {
  background: var(--primary);
}
```

---

### 3. ❌ **Modal Not Appearing for Some Buildings**
**Location:** Tiny Tots Academy, The Ledger's Edge (possibly buildings 6-9)  
**Problem:** Clicking these buildings does not open project information modal  
**Fix Required:**
- Check JavaScript `openModal()` function for data-project binding
- Verify each building has proper `data-project="project-id"` attribute
- Ensure modal content exists for all projects in `projectData` object

**Debug Steps:**
```javascript
// In portfolio.html JavaScript section, verify:
// 1. All buildings have data-project attribute
document.querySelectorAll('.building').forEach(b => {
  console.log(b.textContent, b.dataset.project);
});

// 2. All project data exists
console.log(Object.keys(projectData));
```

---

### 4. ❌ **ACE Concierge Building Has Weird Border**
**Location:** ACE Concierge building  
**Problem:** Blue/cyan highlight border artifact around building  
**Cause:** Likely CSS outline or box-shadow issue  
**Fix Required:**
```css
/* Remove unwanted borders/outlines */
.building {
  outline: none !important;
  box-shadow: none; /* Or adjust existing shadow */
}

/* If specific to ACE Concierge, target it: */
.building[data-project="ace-concierge"] {
  outline: none !important;
  border: none !important;
}
```

---

### 5. ❌ **Drone Half Visible on Drone Repair Workshop**
**Location:** Drone Repair Workshop roof  
**Problem:** Drone graphic color blends with beige background in light mode  
**Fix Required:**
```css
/* Add stronger contrast for drone in light mode */
[data-theme="day"] .drone {
  filter: brightness(0.4) saturate(2); /* Darken and saturate */
  outline: 2px solid #333; /* Add dark outline */
}

/* Or change drone color directly in CSS */
[data-theme="day"] .drone {
  background-color: #2c3e50 !important; /* Dark blue-gray */
  border: 2px solid #000;
}
```

---

## ⚠️ MODERATE ISSUES

### 6. ⚠️ **Direction Boards Not Clickable**
**Location:** Signposts: "↑ MAIN STREET" and "→ RESEARCH QUARTER"  
**Problem:** Visual indicators suggest clickability but they're not interactive  
**Expected Behavior:** Should scroll/navigate to respective sections  
**Fix Required:**
```javascript
// Add click handlers in JavaScript section
document.querySelector('.signpost').addEventListener('click', (e) => {
  const target = e.target.closest('[data-navigate]');
  if (target) {
    const section = target.dataset.navigate;
    document.getElementById(section).scrollIntoView({ behavior: 'smooth' });
  }
});
```

```html
<!-- Update signpost HTML with data attributes -->
<div class="signpost">
  <div data-navigate="town">↑ MAIN STREET</div>
  <div data-navigate="research">→ RESEARCH QUARTER</div>
</div>
```

---

### 7. ⚠️ **Letter 'H' in "Research Quarter" Half Invisible**
**Location:** Research Quarter heading  
**Problem:** Character rendering issue, letter 'H' partially cut off or blending  
**Fix Required:**
```css
/* Fix text rendering */
.town-header h2,
#research h2 {
  letter-spacing: 0.05em; /* Add spacing */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Ensure full visibility in light mode */
[data-theme="day"] #research h2 {
  color: #1a1a1a; /* Very dark, not pure black */
  text-shadow: 0 1px 2px rgba(255,255,255,0.5);
}
```

---

### 8. ⚠️ **Subtitle Text Blending in Light Mode**
**Location:** "Where old experiments sleep and discoveries were born..." and similar subtitles  
**Problem:** Beige/tan text on beige background = invisible  
**Fix Required:**
```css
/* Fix all subtitle/description text in light mode */
[data-theme="day"] .town-header p,
[data-theme="day"] .section-subtitle,
[data-theme="day"] .description-text {
  color: #4a4a4a !important; /* Medium gray */
  text-shadow: 0 1px 2px rgba(255,255,255,0.8);
  font-weight: 500;
}
```

---

### 9. ⚠️ **Research Buildings Not Centered**
**Location:** Research Quarter section  
**Problem:** Buildings appear left-aligned instead of centered on page  
**Fix Required:**
```css
/* Center research section */
#research .street,
#research .buildings-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 auto;
  max-width: 1200px;
}
```

---

### 10. ❓ **Bottom Right Button Functionality Unclear**
**Location:** Bottom right corner of viewport  
**Problem:** Button visible but does nothing when clicked  
**Possible Causes:**
- Could be scroll-to-top button (not working)
- Could be easter egg trigger (no feedback)
- Could be incomplete feature  
**Investigation Required:**
- Identify button element and its purpose
- Check JavaScript event listeners
- Add functionality or remove if not needed

**Likely Fix (if scroll-to-top):**
```javascript
// Ensure scroll-to-top functionality
document.querySelector('.btn-bottom-right').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
```

---

## 🎨 VISUAL CONTRAST SUMMARY

| Element | Current (Light Mode) | Required |
|---------|---------------------|----------|
| Building Names | `#d4c4a8` (beige) | `#3a1f04` (dark brown) |
| Subtitle Text | `#d4c4a8` (beige) | `#4a4a4a` (medium gray) |
| Drone | Light brown | Dark blue-gray `#2c3e50` |
| Research Quarter H | Partially visible | Fully visible with spacing |

---

## 🔧 IMPLEMENTATION PRIORITY

1. **🔴 HIGH PRIORITY (Do First):**
   - Fix building name text contrast (Issue #1)
   - Add horizontal scroll to buildings (Issue #2)
   - Fix modal click handlers (Issue #3)
   - Fix subtitle text contrast (Issue #8)

2. **🟡 MEDIUM PRIORITY (Do Next):**
   - Remove ACE Concierge border (Issue #4)
   - Fix drone visibility (Issue #5)
   - Fix Research Quarter 'H' (Issue #7)
   - Center research buildings (Issue #9)

3. **🟢 LOW PRIORITY (Polish):**
   - Make direction boards clickable (Issue #6)
   - Investigate bottom right button (Issue #10)

---

## 📋 TESTING CHECKLIST

After implementing fixes, test:

- [ ] All building names readable in light mode (15.6" laptop)
- [ ] Horizontal scroll works smoothly on Main Street
- [ ] All buildings 1-9 accessible and clickable
- [ ] Modal opens for ALL buildings with correct content
- [ ] No weird borders/artifacts on any building
- [ ] Drone fully visible in both day/night modes
- [ ] "Research Quarter" text renders completely
- [ ] All subtitle text readable in light mode
- [ ] Research buildings visually centered
- [ ] Bottom right button has clear function or is removed
- [ ] Direction boards navigate correctly (if implemented)

---

## 💡 WCAG ACCESSIBILITY NOTE

**Current Status:** ⚠️ **WCAG AA FAIL in Light Mode**  
- Beige text on beige background: **1.2:1 contrast ratio** (needs ≥4.5:1)
- After fixes: **Dark brown on beige: 8.5:1** ✅ WCAG AAA

---

## 🚀 EXPECTED OUTCOME

After all fixes:
- ✅ Full WCAG AA compliance in both light and dark modes
- ✅ All 9 buildings accessible and functional
- ✅ Smooth horizontal navigation
- ✅ Professional, polished user experience
- ✅ No accessibility barriers

---

**Report Completed:** April 11, 2026, 12 PM IST  
**Next Action:** Implement fixes in priority order and re-test

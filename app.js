\
// State
let mode = "label";
let imageUrl = null;
let ocr = null;
let rawText = "";
let estimateKcal = null;

const FOOD_DB = {
  "apple": 52, "banana": 96, "bread (white)": 265, "bread (wholemeal)": 247, "butter": 717,
  "chicken breast (cooked)": 165, "chips/fries": 312, "egg (boiled)": 155, "grilled salmon": 208,
  "oats": 389, "peanut butter": 588, "pasta (cooked)": 131, "pizza (cheese)": 266, "rice (cooked)": 130,
  "steak (sirloin, cooked)": 271, "tofu": 76, "tomato": 18, "yoghurt (plain)": 59, "avocado": 160, "broccoli": 35,
};

// Elements
const tabLabel = document.getElementById("tab-label");
const tabMeal = document.getElementById("tab-meal");
const dz = document.getElementById("dz");
const fileInput = document.getElementById("file");
const chooseBtn = document.getElementById("btn-choose");
const preview = document.getElementById("preview");
const imgEl = document.getElementById("img");
const clearBtn = document.getElementById("btn-clear");
const labelActions = document.getElementById("label-actions");
const scanBtn = document.getElementById("btn-scan");
const ocrText = document.getElementById("ocr-text");
const progressBar = document.getElementById("progress-bar");
const rightTitle = document.getElementById("right-title");
const rightContent = document.getElementById("right-content");
const exportBtn = document.getElementById("btn-export");

function formatNumber(n, d=0){ if(n==null || Number.isNaN(n)) return "—"; return Number(n).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d}); }
function gramsFromServing(serving){
  if(!serving) return undefined;
  const m = (serving||"").toLowerCase().match(/(\d{1,4})\s*g/);
  if(m) return Number(m[1]);
  if(/per\s*100\s*g/.test((serving||"").toLowerCase())) return 100;
  return undefined;
}

function parseLabelOCR(text){
  const normalized = text.replace(/\n+/g,"\n").replace(/\s{2,}/g," ").toLowerCase();
  const result = { text };
  const kcalMatch = normalized.match(/(calories|energy)\s*[:\-]?\s*(\d{2,4})\s*k?\s*k?cal/);
  if(kcalMatch){ result.calories = Number(kcalMatch[2]); }
  else{
    const kjMatch = normalized.match(/(energy)\s*[:\-]?\s*(\d{3,5})\s*k?j/);
    if(kjMatch){ const kj = Number(kjMatch[2]); result.calories = Math.round(kj/4.184); }
  }
  const per100 = /(per\s*100\s*g|per\s*100g)/.test(normalized);
  const perServing = normalized.match(/per\s*(serving|portion|\d+\s*g)/);
  result.serving = (perServing && perServing[0]) || (per100 ? "per 100g" : undefined);
  const fatMatch = normalized.match(/fat\s*[:\-]?\s*(\d{1,3}(?:\.\d)?)\s*g/);
  const carbsMatch = normalized.match(/carb(?:ohydrate|s)?\s*[:\-]?\s*(\d{1,3}(?:\.\d)?)\s*g/);
  const proteinMatch = normalized.match(/protein\s*[:\-]?\s*(\d{1,3}(?:\.\d)?)\s*g/);
  result.macros = {
    fat: fatMatch ? Number(fatMatch[1]) : undefined,
    carbs: carbsMatch ? Number(carbsMatch[1]) : undefined,
    protein: proteinMatch ? Number(proteinMatch[1]) : undefined,
  };
  return result;
}

function render(){
  tabLabel.classList.toggle("active", mode==="label");
  tabMeal.classList.toggle("active", mode==="meal");
  labelActions.classList.toggle("hidden", !(mode==="label" && imageUrl));

  if(mode==="label"){
    rightTitle.textContent = "Parsed Nutrition (per serving)";
    if(!ocr){
      rightContent.innerHTML = `<p>Upload a clear nutrition label and press <b>Scan Nutrition Label</b>. I'll extract calories and macros automatically.</p>`;
    } else {
      const grams = gramsFromServing(ocr.serving);
      const derived = (grams && ocr.calories) ? Math.round(ocr.calories*(100/grams)) : null;
      rightContent.innerHTML = `
        <div class="kv">
          <div class="box"><div class="label">Calories</div><div style="font-size:28px;font-weight:800">${formatNumber(ocr.calories)}</div></div>
          <div class="box"><div class="label">Serving</div><div style="font-size:18px;font-weight:700">${ocr.serving||"—"}</div></div>
          <div class="box"><div class="label">Fat (g)</div><div style="font-size:22px;font-weight:700">${formatNumber(ocr.macros?.fat,1)}</div></div>
          <div class="box"><div class="label">Carbs (g)</div><div style="font-size:22px;font-weight:700">${formatNumber(ocr.macros?.carbs,1)}</div></div>
          <div class="box"><div class="label">Protein (g)</div><div style="font-size:22px;font-weight:700">${formatNumber(ocr.macros?.protein,1)}</div></div>
        </div>
        ${derived ? `<div style="margin-top:12px" class="alert">≈ ${derived} kcal per 100g (derived)</div>`: ""}
      `;
    }
  } else {
    rightTitle.textContent = "Meal Estimator";
    rightContent.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label class="label" for="food">Food</label>
          <input class="input" id="food" placeholder="e.g., chicken breast" list="food-list"/>
          <datalist id="food-list">${Object.keys(FOOD_DB).map(k=>`<option value="${k}">`).join("")}</datalist>
        </div>
        <div>
          <label class="label" for="grams">Weight (g)</label>
          <input class="input" id="grams" type="number" min="1" value="300"/>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button id="btn-estimate" class="btn btn-primary">Estimate calories</button>
        <button id="btn-reset" class="btn btn-secondary">Reset</button>
      </div>
      <div id="meal-result" style="margin-top:12px"></div>
      <div class="alert" style="margin-top:12px">Portion size drives most of the error. If you have a label, switch to <b>Label</b> and use OCR.</div>
    `;
    document.getElementById("btn-estimate").onclick = ()=>{
      const food = (document.getElementById("food").value||"").toLowerCase().trim();
      const grams = Number(document.getElementById("grams").value||0);
      const base = FOOD_DB[food];
      const out = document.getElementById("meal-result");
      if(base){
        const kcal = Math.round((base/100)*(grams||0));
        out.innerHTML = `<div class="box" style="background:white;border:1px solid rgba(0,0,0,0.06);border-radius:16px;padding:12px">
          <div class="label">Estimated calories</div>
          <div style="font-size:28px;font-weight:800">${formatNumber(kcal)} kcal</div>
          <div style="font-size:12px;color:#475569;margin-top:6px">Based on ${base} kcal per 100g</div>
        </div>`;
      }else{
        out.innerHTML = `<div class="alert">Food not in local DB. Add calories manually, or use a label photo for higher accuracy.</div>`;
      }
    };
    document.getElementById("btn-reset").onclick = ()=>render();
  }
}

tabLabel.onclick = ()=>{ mode="label"; render(); };
tabMeal.onclick = ()=>{ mode="meal"; render(); };

dz.ondragover = (e)=>{ e.preventDefault(); };
dz.ondrop = (e)=>{
  e.preventDefault();
  const f = e.dataTransfer.files?.[0];
  if(!f) return;
  const url = URL.createObjectURL(f);
  imageUrl = url;
  imgEl.src = url;
  preview.classList.remove("hidden");
  labelActions.classList.toggle("hidden", mode!=="label");
};
chooseBtn.onclick = ()=> fileInput.click();
fileInput.onchange = (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  const url = URL.createObjectURL(f);
  imageUrl = url;
  imgEl.src = url;
  preview.classList.remove("hidden");
  labelActions.classList.toggle("hidden", mode!=="label");
};
clearBtn.onclick = ()=>{
  imageUrl = null; imgEl.src=""; preview.classList.add("hidden"); labelActions.classList.add("hidden"); rawText=""; ocr=null; ocrText.textContent="";
};

scanBtn.onclick = async ()=>{
  if(!imageUrl) return;
  progressBar.style.width = "3%";
  try{
    const worker = await Tesseract.createWorker({
      logger: m => {
        if(m.status === "recognizing text" && m.progress!=null){
          progressBar.style.width = Math.round(m.progress*100) + "%";
        }
      }
    });
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data } = await worker.recognize(imageUrl);
    await worker.terminate();
    rawText = data.text || "";
    ocr = parseLabelOCR(rawText);
    ocrText.textContent = rawText;
    progressBar.style.width = "100%";
    setTimeout(()=>progressBar.style.width="0%", 800);
    render();
  }catch(err){
    ocrText.textContent = "OCR failed: " + (err && err.message ? err.message : String(err));
  }
};

exportBtn.onclick = ()=>{
  const payload = {
    mode,
    timestamp: new Date().toISOString(),
    image: !!imageUrl,
    label: ocr,
    rawText
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `calorie-counter-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
};

render();

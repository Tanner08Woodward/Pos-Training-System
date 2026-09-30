// script.js

let currentOrder = [];
let currentTotal = 0;
let change = 0 
let discountAmount = 0;
let totalPaid = 0;

// Index of the order line the trainee tapped (highlighted), or null.
// Like the real register: tap a line, then press Delete Item.
let selectedLine = null;

const TAX_RATE = 0.0825;

// --- Training: action recording (Milestone 1) ---------------------------
// currentCategory is only used so each recorded action knows where the
// trainee was. It does not change how the register works.
let currentCategory = "main";

// Register state attached to every recorded action.
function registerContext() {
  return {
    category: currentCategory,
    orderSize: currentOrder.length,
    total: Math.round(currentTotal * 100) / 100,
  };
}

function track(type, data) {
  // If recording ever breaks, the register must keep working for the trainee,
  // but we want to hear about it in the browser console.
  if (typeof Tracker === "undefined") {
    console.warn("Tracker not loaded; action not recorded:", type);
    return;
  }
  Tracker.record(type, data, registerContext());
}
// ------------------------------------------------------------------------

const menuItems = {
  main: [
    "Small Cone", "Small Cup", "Small Waffle Cone",
    "Small Waffle Bowl", "Dipped Waffle Cone", "Dipped Waffle Bowl",
    "Medium Cone", "Medium Cup", "Medium Waffle Cone",
    "Medium Waffle Bowl", "Dipped Waffle Cone With Sprinkles", " ",
    "Large Cone", "Large Cup",
    "Large Waffle Cone", "Large Waffle Bowl", "Dipped Waffle Cone With Peanuts",
    " ", "Shake",
    "Thick Shake", " ", " ", " ", " ", " ", " ", "Small Hurricane", "Medium Hurricane", "Large Hurricane", " ", " ", " ", " ", " ", " ", " ",  "Pint", "Quart", " ", " ", "4 Scoop Sampler", "Cone Special", 
  ],
  cones: [    "Small Cone", "Small Cup", "Small Waffle Cone",
    "Small Waffle Bowl", " ", " ",
    "Medium Cone", "Medium Cup", "Medium Waffle Cone",
    "Medium Waffle Bowl", " ", "",
    "Large Cone", "Large Cup",
    "Large Waffle Cone", "Large Waffle Bowl", " ", " ", "Cone Special", " ", " ", "Dipped Kid's Cone", "Kid's Cone",
    "", "",
    "", "", "", "", "", "Dipped Waffle Cone", "Dipped Waffle Cone With Sprinkles", "Dipped Waffle Cone With Peanuts"
  ],
  pints: ["Pint", "Quart", "4 Pack Pint", " ", " ", " ",  "2 Pack Waffle Cone", "2 Pack Waffle Bowl", " ", " ", " ", " ", " ","5 Pack Cones"],
  sundaes: [" ", "Banana Split Sundae", "Blondie Sundae", "Brownie Sundae", " ", " ", " ", "Sundae", "Turtle Sundae", "Waffle Bowl Sundae", " ", " ", "Extra Topping", "Whipped Cream", "Sprinkles", ],
  shakes: ["Shake", "Thick Shake", "Monster Shake", "Thick Monster Shake", "Malt", " ",  "Boston Cooler", "Freeze", "Float", "Bottle Water", "Soft Drink"],
  hurricanes: ["Small Hurricane", "Medium Hurricane", "Large Hurricane", "Extra Topping", ],
  novelties: ["4 Scoop Sampler", "Dog Treat", "Handel Pop", "Ice Cream Sandwich", ],
  extras: ["Extra Cone", "Extra Dish", "Extra Topping", "Extra Waffle Cone", "Whipped Cream", " ", "Mixed Nuts", "Pecans", "Sprinkles", "Extra Waffle Bowl", " ", " ", "Kid's Dipped Cone", "Apple Dumpling w/o IC", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ",  "Dipped Waffle Cone", "Dipped Waffle Cone With Sprinkles", "Dipped Waffle Cone With Peanuts", "Dipped Waffle Bowl", " ", " ", "2 Pack Waffle Cone", "2 Pack Waffle Bowl", "5 Pack Cones"],
  giftcards: ["Gift Card Sold", "Check Gift Card Ballence", "Gift Card Reload", " ", " ", " ", "Handel's Coin Sold", "Holiday Card Sold", "Pint Card Sold", "Gift Certificate Sold", " ", " ", "Hat", "T Shirt", ],
  catering: ["Catering", "DoorDash", "Misc. Item", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ",  "Flavor Box - Top 4", "Flavor Box - Custom",]
};

const prices = {
  "Small Cone": 4.60,
  "Medium Cone": 5.60,
  "Large Cone": 6.70,
  "Small Cup": 4.60,
  "Medium Cup": 5.60,
  "Large Cup": 6.70,
  "Small Waffle Cone": 5.70,
  "Medium Waffle Cone": 6.70,
  "Large Waffle Cone": 7.70,
  "Small Waffle Bowl": 5.70,
  "Medium Waffle Bowl": 6.70,
  "Large Waffle Bowl": 7.70,
  "Dipped Waffle Cone": 1.25,
  "Dipped Waffle Cone With Sprinkles": 1.5,
  "Dipped Waffle Cone With Peanuts": 1.5,
  "Cone Special": 2,
  "Shake": 6.25,
  "Thick Shake": 7,
  "Small Hurricane": 5.75,
  "Medium Hurricane": 6.75,
  "Large Hurricane": 7.75,
  "Pint": 6.95,
  "Quart": 11.95,
  "4 Scoop Sampler": 6.5,
  "Sundae": 6.25,
  "Banana Split Sundae": 7.75,
  "Brownie Sundae": 7.25,
  "Blondie Sundae": 7.25,
  "Waffle Bowl Sundae": 7.5,
  "Monster Shake": 9.75,
  "Thick Monster Shake": 10.50,
  "Float": 6,
  "Malt": 6.5,
  "Dog Treat": 3,
  "Ice Cream Sandwich": 3.5,
  "Handel Pop": 3.5,
  "Extra Topping": 1,
  "Whipped Cream": 0.5,
  "Sprinkles": 0.75,
  "Extra Cone": 0.25,
  "Extra Dish": 0.25,
  "Gift Card Sold": 0,
  "Check Gift Card Balance": 0,
  "Gift Card Reload": 0,
  "Holiday Card Sold": 0,
  "Catering": 0,
  "DoorDash": 0,
  "Misc. Item": 0,
  "4 Pack Pint": 27.8,
  "Dipped Waffle Bowl": 0,
  "2 Pack Waffle Cone": 1.5,
  "2 Pack Waffle Bowl": 2.5,
  "5 Pack Cones": 2.25,
  "Flavor Box - Top 4": 18.75,
  "Flavor Box - Custom": 21,
  "Dipped Kids Cone": 4.75
};

function startNewOrder(reason = "new_order_button") {
  track("order_started", { reason });
  currentOrder = [];
  totalPaid = 0;
  discountAmount = 0;
  updateOrderDisplay();
  hideScreens();
  loadCategory("main", false);
}

function hideScreens() {
  document.querySelectorAll(".screen").forEach(screen => screen.style.display = "none");
  document.getElementById("menu-buttons").style.display = "none";
}

function showScreen(id) {
  track("screen_opened", { screen: id });
  document.querySelectorAll(".screen").forEach(s => s.style.display = "none");

  //  Hide menu buttons when showing a top screen
  document.getElementById("menu-buttons").style.display = "none";

  document.getElementById(id).style.display = "block";

  if (id === "payment") {
    document.getElementById("payment-total").innerText = currentTotal.toFixed(2);
    document.getElementById("exact-btn").innerText = `$${currentTotal.toFixed(2)}`;
    document.getElementById("nearest-btn").innerText = `$${Math.ceil(currentTotal).toFixed(2)}`;
    document.getElementById("amount-paid").innerText = totalPaid.toFixed(2);
    document.getElementById("change").innerText = (totalPaid - currentTotal > 0) ? (totalPaid - currentTotal).toFixed(2) : "0.00";
  }
}

function hideScreen(id) {
  track("screen_closed", { screen: id });
  document.getElementById(id).style.display = "none";
  document.getElementById("menu-buttons").style.display = "grid"; // show back main menu
}

function loadCategory(category, byTrainee = true) {
  currentCategory = category;
  if (byTrainee) track("category_opened", { category });
  hideScreens(); 
  const container = document.getElementById("menu-buttons");
  container.style.display = "grid";
  container.innerHTML = "";
  menuItems[category].forEach(item => {
    const btn = document.createElement("button");
    btn.innerText = item;
    btn.onclick = () => addItem(item);
    if (item.toLowerCase().includes("dipped waffle")) btn.classList.add("brown");
    if (item.trim() === "") btn.classList.add("clear");
    container.appendChild(btn);
  });
}

function addItem(item) {
  if (!item || item.trim() === "") {
    track("empty_slot_tapped", {});
    return;
  }
  const hasRealPrice = typeof prices[item] === "number" && prices[item] > 0;
  track("item_added", {
    item,
    price: prices[item] || 3.0,        // the price actually charged today
    priceFallback: !hasRealPrice,      // true = the $3.00 default was used
    line: currentOrder.length + 1,
  });
  currentOrder.push(item);
  updateOrderDisplay();
}

function updateOrderDisplay() {
  const list = document.getElementById("order-list");
  list.innerHTML = "";

  // A highlighted line only stays valid while it still exists.
  if (selectedLine !== null && selectedLine >= currentOrder.length) selectedLine = null;

  let subtotal = 0;
  currentOrder.forEach((item, index) => {
    const price = prices[item] || 3.0;
    const li = document.createElement("li");
    li.innerText = `${item} - $${price.toFixed(2)}`;
    if (index === selectedLine) li.classList.add("selected");
    li.onclick = () => selectLine(index);
    list.appendChild(li);
    subtotal += price;
  });

  subtotal -= discountAmount;
  const tax = subtotal * TAX_RATE;
  currentTotal = Math.max(0, subtotal + tax);

  document.getElementById("subtotal").innerText = subtotal.toFixed(2);
  document.getElementById("tax").innerText = tax.toFixed(2);
  document.getElementById("total").innerText = currentTotal.toFixed(2);
}

function applyPayment(amount, method = "cash_button") {
  track("tender_applied", {
    method,
    amount: Math.round(amount * 100) / 100,
    paidBefore: Math.round(totalPaid * 100) / 100,
  });
  totalPaid += amount;
  document.getElementById("amount-paid").innerText = totalPaid.toFixed(2);
  const change = totalPaid - currentTotal;
  document.getElementById("change").innerText = change > 0 ? change.toFixed(2) : "0.00";

  if (totalPaid >= currentTotal) {
    setTimeout(() => {
      alert(`Transaction complete! Change: $${change.toFixed(2)}`);
      completeTransaction("auto_after_payment");
    }, 300);
  }
}

function payExact() {
  applyPayment(currentTotal, "exact");
}

function payNearest() {
  applyPayment(Math.ceil(currentTotal), "nearest");
}

function payCustom() {
  const val = parseFloat(document.getElementById("custom-amount").value);
  if (!isNaN(val) && val > 0) {
    applyPayment(val, "custom");
    document.getElementById("custom-amount").value = "";
  } else {
    track("custom_amount_invalid", { entered: document.getElementById("custom-amount").value });
  }
}

function completeTransaction(trigger = "complete_button") {
  track("transaction_completed", {
    trigger,
    items: currentOrder.slice(),
    discount: Math.round(discountAmount * 100) / 100,
    total: Math.round(currentTotal * 100) / 100,
    paid: Math.round(totalPaid * 100) / 100,
    change: Math.round(Math.max(0, totalPaid - currentTotal) * 100) / 100,
  });
  alert("Thank you!");
  startNewOrder("after_transaction");
}

function deleteLastItem() {
  if (currentOrder.length > 0) {
    track("item_removed", { item: currentOrder[currentOrder.length - 1], line: currentOrder.length, method: "delete_last" });
  } else {
    track("delete_on_empty_order", {});
  }
  currentOrder.pop();
  updateOrderDisplay();
}

// Tap an order line to highlight it; tap it again to un-highlight.
function selectLine(index) {
  selectedLine = (selectedLine === index) ? null : index;
  track("line_selected", { item: currentOrder[index], line: index + 1, selected: selectedLine !== null });
  updateOrderDisplay();
}

// Delete the highlighted line (any line, not just the last one).
function deleteSelectedItem() {
  if (selectedLine === null) {
    track("delete_without_selection", {});
    return;
  }
  const index = selectedLine;
  track("item_removed", { item: currentOrder[index], line: index + 1, method: "delete_selected" });
  currentOrder.splice(index, 1);
  selectedLine = null;
  updateOrderDisplay();
}

function clearOrder() {
  track("order_cleared", { itemsRemoved: currentOrder.slice() });
  currentOrder = [];
  updateOrderDisplay();
}

function applyPercentDiscount() {
  const percent = parseFloat(prompt("Enter discount percent (e.g., 10 for 10%)"));
  if (!isNaN(percent) && percent >= 0 && percent <= 100) {
    const rawSubtotal = currentOrder.reduce((sum, item) => sum + (prices[item] || 3.0), 0);
    discountAmount = rawSubtotal * (percent / 100);
    track("discount_applied", { kind: "percent", percent, amount: Math.round(discountAmount * 100) / 100 });
    updateOrderDisplay();
  } else {
    track("discount_cancelled", { kind: "percent" });
  }
}

function applyFlatDiscount() {
  const amount = parseFloat(prompt("Enter flat dollar discount:"));
  if (!isNaN(amount) && amount > 0) {
    discountAmount = amount;
    track("discount_applied", { kind: "flat", amount: Math.round(amount * 100) / 100 });
    updateOrderDisplay();
  } else {
    track("discount_cancelled", { kind: "flat" });
  }
}

document.getElementById("pinpad-btn").addEventListener("click", () => {
  track("tender_applied", { method: "pinpad", amount: Math.round(currentTotal * 100) / 100, paidBefore: Math.round(totalPaid * 100) / 100 });
  // Optional: simulate delay for processing
  setTimeout(() => {
    alert("Payment was sent to the pinpad and completed.");
    completeTransaction("auto_after_pinpad"); // Calls your existing function to complete the order
  }, 500); // half a second delay for realism
});

hideScreens();
loadCategory("main", false);
track("session_started", { register: "handels", version: "m1" });


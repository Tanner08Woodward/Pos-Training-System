// lessons/handels.js: Handel's Training lessons (business configuration)
//
// A lesson is a list of steps. Each step tells the trainee what to do
// ("do"), which button/action counts as correct ("target"), and why it
// matters ("why", shown as a tip if they get stuck).
//
// TARGETS
//   { category: "cones" }             open a tab
//   { item: "Small Cone" }            ring an item
//   { line: 2 }                       tap order line 2 (highlight it)
//   { screen: "payment" }             open PAY / Manager / Discount screen
//   { action: "delete_item", removes: "Small Cup" }  Manager > Delete Item
//                                     (and it must remove that item)
//   { action: "delete_all" }          Manager > Delete All
//   { action: "pinpad" }              Pay with Pinpad
//   { action: "cash", amount: 20 }    tap the $20 cash button
//   { action: "exact" }               tap the Exact amount button
//   { action: "percent_discount", percent: 50 }
//   { info: true }                    explanation only; trainee taps Next
//
// "checkpoint: true" marks where an order starts. If the trainee knocks
// the lesson off track (e.g. finishes the sale early), it restarts there
// with a fresh order.

var Lessons = (() => {
  const list = [
    {
      id: "register-tour",
      version: 1,
      title: "Register tour",
      summary: "Where everything is, ring your first items, and take a card payment.",
      steps: [
        { info: true, do: "This is the register. The order shows on the left, buttons for the current tab are in the middle, tabs are on the right, and PAY is bottom-right." },
        { checkpoint: true, target: { category: "main" }, do: "Tap Main Menu.", why: "Main Menu has the most common items: cones, cups, waffle cones, shakes, hurricanes, pints." },
        { target: { item: "Small Cone" }, do: "Ring a Small Cone.", why: "Size and cone/cup are ONE button. Flavors are never rung; you call them out to the scooper." },
        { target: { item: "Medium Cup" }, do: "Now ring a Medium Cup.", why: "Same idea: the button is size + what it's served in." },
        { info: true, do: "Both items are on the order with their prices. The total at the bottom-left already includes tax." },
        { target: { screen: "payment" }, do: "Tap PAY / CLOSE ORDER to take payment.", why: "Every order ends here. The payment screen shows the amount due." },
        { target: { action: "pinpad" }, do: "The customer is paying by card. Tap Pay with Pinpad.", why: "Card payments go through the pinpad. The sale finishes on its own." },
      ],
    },
    {
      id: "sizes",
      version: 1,
      title: "Sizes: count the flavors",
      summary: "1 flavor = small, 2 flavors = medium (unless they say a size).",
      steps: [
        { info: true, do: "Customers rarely say a size. Count the flavors: 1 flavor = Small, 2 flavors = Medium. Sugar and cake cones use the plain \"Cone\" buttons." },
        { checkpoint: true, target: { item: "Small Cone" }, do: "Customer: \"Can I get a cake cone of strawberry?\"", why: "1 flavor = Small. Cake cone = the Cone button. So: Small Cone." },
        { target: { item: "Medium Cup" }, do: "Customer: \"A cup with vanilla and chocolate, please.\"", why: "2 flavors = Medium. Cup = Medium Cup." },
        { target: { item: "Medium Waffle Cone" }, do: "Customer: \"Can I get a waffle of coffee and graham?\"", why: "\"Waffle\" = waffle cone. 2 flavors (Coffee Chocolate Chip + Graham Central Station) = Medium Waffle Cone." },
        { target: { item: "Large Waffle Bowl" }, do: "Customer: \"A LARGE waffle bowl of mint.\"", why: "When they say a size, ring that size. Large Waffle Bowl." },
        { target: { screen: "payment" }, do: "That's everything. Open PAY.", why: "Ring the whole order first, then take payment." },
        { target: { action: "pinpad" }, do: "They're paying by card.", why: "Card = Pay with Pinpad." },
      ],
    },
    {
      id: "dipped",
      version: 1,
      title: "Dipped cones & the Cones tab",
      summary: "Dipped is its own brown button. Kid's cones live in Cones and Dishes.",
      steps: [
        { checkpoint: true, target: { item: "Medium Waffle Cone" }, do: "Customer: \"A medium waffle cone, dipped with sprinkles.\" First ring the cone.", why: "A dipped waffle cone is TWO lines: the waffle cone, then the dip." },
        { target: { item: "Dipped Waffle Cone With Sprinkles" }, do: "Now ring the dip with sprinkles.", why: "The brown buttons are the dipped add-ons. Ring them right after the waffle cone." },
        { target: { category: "cones" }, do: "Next customer wants a kid's cone. Open the Cones and Dishes tab.", why: "Kid's cones aren't on Main Menu. Cones and Dishes has every cone, cup and kid's size." },
        { target: { item: "Kid's Cone" }, do: "Ring a Kid's Cone.", why: "Kid's Cone is on the Cones and Dishes tab." },
        { target: { screen: "payment" }, do: "Open PAY.", why: "Order complete, take payment." },
        { target: { action: "pinpad" }, do: "Card payment.", why: "Card = Pay with Pinpad." },
      ],
    },
    {
      id: "fixing-mistakes",
      version: 1,
      title: "Fixing mistakes",
      summary: "Delete one line, several lines, the last line, or everything.",
      steps: [
        { checkpoint: true, target: { item: "Small Cone" }, do: "Ring a Small Cone.", why: "Setting up an order to practice fixing." },
        { target: { item: "Small Cup" }, do: "Ring a Small Cup.", why: "Setting up an order to practice fixing." },
        { target: { item: "Large Cone" }, do: "Ring a Large Cone.", why: "Setting up an order to practice fixing." },
        { target: { line: 2 }, do: "Customer: \"Actually, no cup.\" Tap the Small Cup line on the left to highlight it.", why: "Tap a line to highlight it. You can highlight more than one." },
        { target: { screen: "manager-screen" }, do: "Open Manager.", why: "Delete Item and Delete All are on the Manager screen." },
        { target: { action: "delete_item", removes: "Small Cup" }, do: "Tap Delete Item.", why: "Delete Item removes every highlighted line." },
        { target: { item: "Medium Cup" }, do: "Customer: \"Make it a medium cup instead.\" Ring a Medium Cup.", why: "After deleting, ring the right item. Tap Main Menu if you don't see it." },
        { target: { screen: "manager-screen" }, do: "Customer: \"Forget the medium cup.\" It's the last line. Open Manager.", why: "No need to highlight the last line." },
        { target: { action: "delete_item", removes: "Medium Cup" }, do: "Tap Delete Item with nothing highlighted.", why: "With nothing highlighted, Delete Item removes the LAST line." },
        { target: { action: "delete_all" }, do: "Customer: \"Never mind, we'll come back later.\" Tap Delete All.", why: "Delete All clears the whole order. Only use it when the whole order is cancelled." },
      ],
    },
    {
      id: "payment",
      version: 1,
      title: "Taking payment",
      summary: "Enter the cash they hand you so the change is right. Card = pinpad.",
      steps: [
        { checkpoint: true, target: { item: "Medium Cone" }, do: "Ring a Medium Cone.", why: "Setting up a cash sale." },
        { target: { screen: "payment" }, do: "Open PAY.", why: "The payment screen shows the amount due." },
        { target: { action: "cash", amount: 20 }, do: "The customer hands you a $20 bill. Tap $20.", why: "Always enter the cash they HAND you, not the total. The register shows the change to give back." },
        { info: true, do: "The sale finished and the register showed the change to give back. Next: exact change." },
        { checkpoint: true, target: { item: "Small Cup" }, do: "Ring a Small Cup.", why: "Setting up an exact-change sale." },
        { target: { screen: "payment" }, do: "Open PAY.", why: "Take payment." },
        { target: { action: "exact" }, do: "The customer hands you the exact amount. Tap the Exact button (it shows the total).", why: "Exact = customer paid the exact total, no change due." },
        { checkpoint: true, target: { item: "Pint" }, do: "Last one. Ring a Pint.", why: "Setting up a card sale." },
        { target: { screen: "payment" }, do: "Open PAY.", why: "Take payment." },
        { target: { action: "pinpad" }, do: "They tap their card. Pay with Pinpad.", why: "Card, tap or phone pay = Pay with Pinpad." },
      ],
    },
    {
      id: "tabs",
      version: 1,
      title: "Finding items on every tab",
      summary: "Pints, sundaes, shakes, novelties, extras.",
      steps: [
        { checkpoint: true, target: { category: "pints" }, do: "Customer wants a 4-pack of pints. Open Pints and Quarts.", why: "Packs of pints, quarts and take-home waffle cones are on Pints and Quarts." },
        { target: { item: "4 Pack Pint" }, do: "Ring a 4 Pack Pint.", why: "4 Pack Pint is on Pints and Quarts." },
        { target: { category: "sundaes" }, do: "Next: a banana split. Open Sundaes.", why: "All sundaes, plus Extra Topping, Whipped Cream and Sprinkles." },
        { target: { item: "Banana Split Sundae" }, do: "Ring a Banana Split Sundae.", why: "Banana Split is on the Sundaes tab." },
        { target: { category: "shakes" }, do: "Next: a malt. Open Shakes and Drinks.", why: "Shakes, malts, floats, freezes and drinks." },
        { target: { item: "Malt" }, do: "Ring a Malt.", why: "Malt is on Shakes and Drinks." },
        { target: { category: "novelties" }, do: "They want a treat for their dog. Open Novelties.", why: "Dog treats, Handel Pops, sandwiches and the 4 Scoop Sampler." },
        { target: { item: "Dog Treat" }, do: "Ring a Dog Treat.", why: "Dog Treat is on Novelties." },
        { target: { screen: "manager-screen" }, do: "Practice order: clear it. Open Manager.", why: "Clearing practice items." },
        { target: { action: "delete_all" }, do: "Tap Delete All.", why: "Clears the whole order." },
      ],
    },
    {
      id: "discounts",
      version: 1,
      title: "Discounts",
      summary: "50% for team members' family, veterans, military and first responders.",
      steps: [
        { info: true, do: "50% off: team members' families, off-the-clock team members, veterans, military and first responders (police, fire, EMT). NOT on gift cards, and can't be combined with coupons." },
        { checkpoint: true, target: { item: "Medium Waffle Cone" }, do: "A firefighter orders a medium waffle cone. Ring it.", why: "Ring the order first, then apply the discount." },
        { target: { screen: "discount" }, do: "Tap Discount at the top.", why: "Discounts are on the Discount screen." },
        { target: { action: "percent_discount", percent: 50 }, do: "Tap % Discount, type 50, and press OK.", why: "First responders get 50% off. % Discount takes a percentage of the order." },
        { target: { screen: "payment" }, do: "Open PAY. The total is now half.", why: "Check the total dropped before taking payment." },
        { target: { action: "pinpad" }, do: "Card payment.", why: "Card = Pay with Pinpad." },
      ],
    },
  ];

  function get(id) {
    return list.find(l => l.id === id) || null;
  }

  return { list, get };
})();

if (typeof module !== "undefined") module.exports = Lessons;

// scenarios/handels.js: Handel's Challenge orders (business configuration)
//
// HOW A SCENARIO WORKS
// The customer says each step's line in order. "order" is what the register
// should show AFTER that step (the whole order, not just the change).
// The next line is only revealed once the trainee has rung the current order
// correctly OR opens PAY, so a change of mind ("actually, make that a cup")
// comes after they think they're done, like real life.
//
// "pay" is what the customer says when the trainee opens the PAY screen on
// the final order:
//   { method: "card" }               -> trainee should use Pay with Pinpad
//   { method: "cash", tendered: 20 } -> trainee should enter exactly $20
//
// "targetSeconds" is the speed goal. Placeholder for now: have experienced
// staff play each scenario and set this from their times.

var Scenarios = (() => {
  const list = [
    {
      id: "cake-cone",
      version: 1,
      title: "One flavor, cake cone",
      difficulty: 1,
      skills: ["size_translation"],
      targetSeconds: 15,
      steps: [
        { say: "Hi! Can I get a cake cone of strawberry?", order: ["Small Cone"] },
      ],
      pay: { method: "card", say: "I'll pay with card." },
      tip: "One flavor = small. Sugar and cake cones use the Cone buttons.",
    },
    {
      id: "two-flavor-waffle",
      version: 1,
      title: "Two flavors, waffle cone",
      difficulty: 1,
      skills: ["size_translation", "cash"],
      targetSeconds: 20,
      steps: [
        { say: "Can I get a waffle of coffee and graham?", order: ["Medium Waffle Cone"] },
      ],
      pay: { method: "cash", tendered: 10, say: "Here's a ten." },
      tip: "Two flavors with no size = medium. Enter the cash the customer hands you, not Exact.",
    },
    {
      id: "waffle-to-sugar",
      version: 1,
      title: "Customer changes the cone",
      difficulty: 2,
      skills: ["change_of_mind", "corrections"],
      targetSeconds: 25,
      steps: [
        { say: "I'll have a medium chocolate in a waffle cone.", order: ["Medium Waffle Cone"] },
        { say: "...actually, can I change that to a sugar cone?", order: ["Medium Cone"] },
      ],
      pay: { method: "card", say: "Card, please." },
      tip: "Tap the wrong line, press Manager > Delete Item, then ring the right one.",
    },
    {
      id: "dipped-size-change",
      version: 1,
      title: "Dipped cone, size change",
      difficulty: 2,
      skills: ["addons", "change_of_mind", "corrections"],
      targetSeconds: 30,
      steps: [
        {
          say: "Can I get a large waffle cone dipped with sprinkles? Butter pecan.",
          order: ["Large Waffle Cone", "Dipped Waffle Cone With Sprinkles"],
        },
        {
          say: "Oh wait, that's a lot. Can you make it a medium? Still dipped.",
          order: ["Medium Waffle Cone", "Dipped Waffle Cone With Sprinkles"],
        },
      ],
      pay: { method: "card", say: "I'll tap my card." },
      tip: "Only the cone changes. Highlight just the Large Waffle Cone line and delete it; keep the dip.",
    },
    {
      id: "family-order",
      version: 1,
      title: "Family order + add-on",
      difficulty: 3,
      skills: ["multi_item", "size_translation", "change_of_mind", "cash"],
      targetSeconds: 45,
      steps: [
        {
          say: "OK, we need two small cups, one vanilla and one chocolate, a cone with mint and cookie dough, and a shake.",
          order: ["Small Cup", "Small Cup", "Medium Cone", "Shake"],
        },
        {
          say: "Oh! And can we get a pint of vanilla to take home?",
          order: ["Small Cup", "Small Cup", "Medium Cone", "Shake", "Pint"],
        },
      ],
      pay: { method: "cash", tendered: 40, say: "Here's forty." },
      tip: "Two flavors = medium. Additions go on the same order; nothing needs deleting.",
    },
    {
      id: "sundae-remove",
      version: 1,
      title: "Remove an item",
      difficulty: 2,
      skills: ["change_of_mind", "corrections"],
      targetSeconds: 25,
      steps: [
        { say: "Can I get a brownie sundae and a small cup of cotton candy?", order: ["Brownie Sundae", "Small Cup"] },
        { say: "Actually, forget the cup. Just the sundae.", order: ["Brownie Sundae"] },
      ],
      pay: { method: "cash", tendered: 20, say: "Here's a twenty." },
      tip: "Delete only the cup. Then enter the $20 the customer handed you.",
    },
  ];

  function get(id) {
    return list.find(s => s.id === id) || null;
  }

  // How scoring reads a Handel's button name. Size and product come from
  // the name ("Medium Waffle Cone"); add-ons are the brown dipped buttons
  // and toppings, which ring as their own line after the item.
  const ADDONS = ["Extra Topping", "Whipped Cream", "Sprinkles"];
  function itemInfo(name) {
    const m = /^(Small|Medium|Large)\s+(.*)$/.exec(name);
    return {
      size: m ? m[1] : null,
      product: m ? m[2] : name,
      addon: /^Dipped Waffle (Cone|Bowl)/.test(name) || ADDONS.includes(name),
    };
  }

  return { list, get, itemInfo };
})();

if (typeof module !== "undefined") module.exports = Scenarios;

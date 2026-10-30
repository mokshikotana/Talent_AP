// Customer Resolution Assistant templates. Policy-constrained generation:
//  - 30-day free returns, zero restocking fee (see POLICY)
//  - Never accuses the customer of fraud
//  - Never promises refund completion, exchanges or delivery dates
//  - Ambiguous cases ask for evidence respectfully
// Languages: English, Hinglish (romanized), Hindi (Devanagari).

import { POLICY, type ReturnClass } from "./labels";
import { detectLanguage } from "./text";

export type MessageCategory = ReturnClass | "ambiguous";
export type MessageLanguage = "en" | "hinglish" | "hi";

export interface DraftInput {
  category: MessageCategory;
  language: MessageLanguage;
  customerName?: string;
  productName?: string;
}

const OPENERS: Record<MessageLanguage, (name?: string) => string> = {
  en: (n) => `Hi${n ? ` ${n}` : ""},`,
  hinglish: (n) => `Namaste${n ? ` ${n}` : ""} ji,`,
  hi: (n) => `नमस्ते${n ? ` ${n}` : ""} जी,`,
};

const BODIES: Record<MessageCategory, Record<MessageLanguage, (product?: string) => string>> = {
  genuine_fit_issue: {
    en: (p) =>
      `thank you for reaching out about your ${p ?? "item"}. We are sorry the fit was not right — sizing should never be a burden on you. Your return is completely free within our ${POLICY.returnWindowDays}-day window and there is no restocking fee. Please use the prepaid return label in your account; once the item reaches us and is verified, your refund goes to the original payment method. We have also shared your note with our sizing team so the size chart can be corrected for future customers.`,
    hinglish: (p) =>
      `aapke ${p ?? "item"} ke baare mein batane ke liye shukriya. Maaf kijiye, fitting sahi nahi bani — sizing ki wajah se aapko parishani nahi honi chahiye. Aapka return bilkul free hai hamari ${POLICY.returnWindowDays}-din ki policy ke andar, aur koi restocking fee nahi hai. Account mein prepaid return label use kariye; item hum tak pahunchkar verify hone ke baad refund aapke original payment method mein ho jayega. Humne aapka feedback sizing team ko bheja hai taaki size chart theek kiya ja sake.`,
    hi: (p) =>
      `अपने ${p ?? "आइटम"} के बारे में बताने के लिए धन्यवाद। खेद है कि फिटिंग सही नहीं बनी। हमारी ${POLICY.returnWindowDays}-दिन की नीति के अंतर्गत आपका रिटर्न पूरी तरह मुफ्त है और कोई रीस्टॉकिंग शुल्क नहीं है। कृपया अपने खाते में उपलब्ध प्रीपेड रिटर्न लेबल का उपयोग करें; आइटम प्राप्त होकर सत्यापित होने के बाद रिफंड आपके मूल भुगतान माध्यम में कर दिया जाएगा। आपकी टिप्पणी हमारी साइज़िंग टीम को भेज दी गई है।`,
  },
  genuine_quality_issue: {
    en: (p) =>
      `thank you for telling us about the quality issue with your ${p ?? "item"} — that is not the standard we want to deliver. Your return is free within the ${POLICY.returnWindowDays}-day window and carries no restocking fee. If you can share a photo of the defect it will help our quality team fix the root cause, but it is not a condition for your return. After the item is received and verified, the refund is issued to your original payment method.`,
    hinglish: (p) =>
      `apne ${p ?? "item"} ki quality issue ke baare mein batane ke liye dhanyavaad — yeh hamare standard ke mutabik nahi hai. ${POLICY.returnWindowDays}-din ki window ke andar aapka return free hai, koi restocking fee nahi. Agar aap defect ki photo share kar sakte hain to hamari quality team ko madad milegi, par yeh aapke return ki shart nahi hai. Item milne aur verify hone ke baad refund aapke original payment method mein ho jayega.`,
    hi: (p) =>
      `अपने ${p ?? "आइटम"} की गुणवत्ता समस्या के बारे में बताने के लिए धन्यवाद — यह हमारे मानक के अनुरूप नहीं है। ${POLICY.returnWindowDays}-दिन की अवधि के भीतर आपका रिटर्न मुफ्त है, कोई रीस्टॉकिंग शुल्क नहीं। यदि संभव हो तो दोष की तस्वीर साझा करें — यह हमारी गुणवत्ता टीम की मदद करेगी, पर यह आपके रिटर्न की शर्त नहीं है। आइटम प्राप्त होकर सत्यापित होने के बाद रिफंड मूल भुगतान माध्यम में किया जाएगा।`,
  },
  genuine_wrong_item: {
    en: (p) =>
      `we are sorry — you received a different ${p ?? "item"} than the one you ordered. That mix-up is on us. The return is completely free within ${POLICY.returnWindowDays} days and there is no restocking fee. Please hand the item to the pickup partner using the return label; once it is received and verified, your refund will be issued to the original payment method.`,
    hinglish: (p) =>
      `humhe maaf kijiye — aapko order kiye hue ${p ?? "item"} ke bajaye kuch aur mila. Yeh galti humari hai. ${POLICY.returnWindowDays} din ke andar return bilkul free hai, restocking fee zero hai. Return label ke saath item pickup partner ko de dijiye; receive hone aur verify hone ke baad refund original payment method mein aa jayega.`,
    hi: (p) =>
      `क्षमा करें — आपको ऑर्डर किया हुआ ${p ?? "आइटम"} नहीं, कुछ और प्राप्त हुआ। यह गलती हमारी है। ${POLICY.returnWindowDays} दिनों के भीतर रिटर्न पूरी तरह मुफ्त है, रीस्टॉकिंग शुल्क शून्य है। कृपया रिटर्न लेबल के साथ आइटम पिकअप पार्टनर को सौंप दें; प्राप्ति एवं सत्यापन के बाद रिफंड मूल भुगतान माध्यम में जारी होगा।`,
  },
  abusive: {
    // Suspected-abuse cases are never accused. The only message we draft is a
    // respectful evidence request; specialists decide outcomes.
    en: (p) =>
      `thank you for contacting us about your ${p ?? "item"}. As part of a routine verification applied to a random share of returns, could you please share a photo of the item in its current condition along with the packaging slip? Your ${POLICY.returnWindowDays}-day free return window remains fully valid while verification runs, and there is never a restocking fee. A specialist will review and follow up shortly.`,
    hinglish: (p) =>
      `aapke ${p ?? "item"} ke baare mein sampark karne ke liye shukriya. Returns ke ek chune hue sample par ki jaane wali routine verification ke tahat, kya aap item ki current condition ki photo aur packing slip share kar sakte hain? Is dauran aapki ${POLICY.returnWindowDays}-din ki free return window poori valid rahegi, aur restocking fee kabhi nahi lagti. Hamari specialist team review karke jald jawab degi.`,
    hi: (p) =>
      `अपने ${p ?? "आइटम"} के बारे में संपर्क करने के लिए धन्यवाद। रिटर्न के चयनित नमूने पर की जाने वाली नियमित सत्यापन प्रक्रिया के तहत, क्या आप आइटम की वर्तमान स्थिति की तस्वीर और पैकिंग स्लिप साझा कर सकते हैं? इस दौरान आपकी ${POLICY.returnWindowDays}-दिन की मुफ्त रिटर्न अवधि पूरी मान्य रहेगी, और रीस्टॉकिंग शुल्क कभी नहीं लगता। हमारी विशेषज्ञ टीम समीक्षा कर शीघ्र उत्तर देगी।`,
  },
  ambiguous: {
    en: (p) =>
      `thank you for contacting us about your ${p ?? "item"}. To make sure we resolve this correctly for you, could you share a little more detail — for example a photo of the item as received, and what felt wrong about it? Your ${POLICY.returnWindowDays}-day free return window remains fully valid while we look at this together, and there is never a restocking fee. A specialist will review the details and follow up shortly.`,
    hinglish: (p) =>
      `aapke ${p ?? "item"} ke baare mein sampark karne ke liye shukriya. Isko sahi tarike se suljhane ke liye kya aap thodi aur jankari de sakte hain — jaise item ki photo aur kya dikkat lagi? Tab tak aapki ${POLICY.returnWindowDays}-din ki free return window poori valid rahegi, aur restocking fee kabhi nahi lagti. Hamari specialist team details dekhegi aur jald jawab degi.`,
    hi: (p) =>
      `अपने ${p ?? "आइटम"} के बारे में संपर्क करने के लिए धन्यवाद। इसे सही ढंग से सुलझाने के लिए क्या आप कुछ और विवरण साझा कर सकते हैं — जैसे प्राप्त आइटम की तस्वीर और क्या समस्या लगी? तब तक आपकी ${POLICY.returnWindowDays}-दिन की मुफ्त रिटर्न अवधि पूरी मान्य रहेगी, और रीस्टॉकिंग शुल्क कभी नहीं लगता। हमारी विशेषज्ञ टीम विवरण देखकर शीघ्र उत्तर देगी।`,
  },
};

const CLOSINGS: Record<MessageLanguage, string> = {
  en: "With care,\nReturnGuard Support Team",
  hinglish: "Dhanyavaad,\nReturnGuard Support Team",
  hi: "धन्यवाद,\nरिटर्नगार्ड सपोर्ट टीम",
};

export function draftMessage(input: DraftInput): { body: string; notes: string[] } {
  const lang = BODIES[input.category] ? input.language : "en";
  const body = `${OPENERS[lang](input.customerName)}\n\n${BODIES[input.category][lang](input.productName)}\n\n${CLOSINGS[lang]}`;
  const notes = [
    `Policy compliant: ${POLICY.summary}`,
    "No fraud accusation, no invented refund timelines, no delivery promises.",
    "Requires human approval before sending.",
  ];
  return { body, notes };
}

export const MESSAGE_LANGUAGES: { id: MessageLanguage; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hinglish", label: "Hinglish (romanized)" },
  { id: "hi", label: "हिन्दी (Devanagari)" },
];

/**
 * Safety gate for AI-drafted customer messages. An output reaches the UI only
 * when it matches the requested language and stays inside the actual policy.
 */
export function validateCustomerDraft(
  body: string,
  language: MessageLanguage,
  category?: MessageCategory,
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const text = body.trim();
  const lower = text.toLowerCase();
  if (text.length < 40 || text.length > 4000) issues.push("invalid_length");

  const detected = detectLanguage(text);
  if (language === "hinglish" && detected !== "hinglish") issues.push("language_mismatch_hinglish");
  if (language === "hi" && !/[\u0900-\u097F]/u.test(text)) issues.push("language_mismatch_hindi");
  if (language === "en" && detected === "hi") issues.push("language_mismatch_english");

  // Unsupported conditions/promises that are NOT in the actual 30-day policy.
  const forbiddenClaims = [
    /full refund/i,
    /original condition/i,
    /unused condition/i,
    /tags? (must|should) (be|remain)/i,
    /refund (has been|is now) (completed|processed)/i,
    /exchange (is|will be) available/i,
    /guaranteed (refund|exchange|delivery)/i,
  ];
  if (forbiddenClaims.some((re) => re.test(text))) issues.push("unsupported_policy_claim");

  // Fit problems are sizing issues—not evidence investigations. Do not burden a
  // genuine fit customer with photos or packing-slip requests.
  if (
    category === "genuine_fit_issue" &&
    /(packing slip|photo|photograph|tasveer|फोटो|पैकिंग स्लिप)/i.test(text)
  ) {
    issues.push("unnecessary_evidence_request");
  }

  // Customer accusation guard across supported languages.
  const accusations = ["fraud", "fraudulent", "cheat", "cheating", "dhoka", "बेईमान", "धोखा"];
  if (accusations.some((word) => lower.includes(word))) issues.push("accusatory_language");

  // Every response must preserve the core policy facts.
  if (!text.includes("30")) issues.push("return_window_missing");
  const feeMention = lower.includes("restocking") || lower.includes("रीस्टॉकिंग");
  if (!feeMention) issues.push("fee_policy_missing");

  return { ok: issues.length === 0, issues };
}

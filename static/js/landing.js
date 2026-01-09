// === Landing-only JS (no maps, no charts) ===

// 1) Header turns white on scroll
window.addEventListener("scroll", () => {
  const header = document.querySelector("header");
  if (!header) return;
  if (window.scrollY > 50) header.classList.add("scrolled");
  else header.classList.remove("scrolled");
});

// 2) Smooth scroll for "Подробнее"
document.querySelector(".more-btn")?.addEventListener("click", () => {
  document.querySelector(".features")?.scrollIntoView({ behavior: "smooth" });
});

// 3) Fade-in animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("fade-in");
  });
}, { threshold: 0.2 });

document
  .querySelectorAll(".feature, .capability, .faq-item, .features, .capabilities, .preview")
  .forEach(el => observer.observe(el));

// 4) Safety: show everything if observer didn't trigger
window.addEventListener("load", () => {
  setTimeout(() => {
    document
      .querySelectorAll(".feature, .capability, .faq-item, .features, .capabilities, .preview")
      .forEach(el => el.classList.add("fade-in"));
  }, 500);
});

console.log("✅ Landing JS loaded");


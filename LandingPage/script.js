document.addEventListener("DOMContentLoaded", () => {
  
    const lottieContainer = document.getElementById("lottie-container")
  
    if (lottieContainer) {
      const animation = lottie.loadAnimation({
        container: lottieContainer,
        renderer: "svg",
        loop: true,
        autoplay: true,
        path: "https://blobs.vusercontent.net/blob/final-cWin6iU31BGHxxCydERXRXQAibg9Uj.json",
        rendererSettings: {
          preserveAspectRatio: "xMidYMid meet",
          clearCanvas: false,
          progressiveLoad: true,
          hideOnTransparent: true,
        },
      })
  
      animation.addEventListener("DOMLoaded", () => {
        console.log("Animação carregada com sucesso")
        lottieContainer.style.opacity = "1"
      })
  
      animation.addEventListener("error", (error) => {
        console.error("Erro na animação:", error)
       
        lottieContainer.innerHTML =
          '<img src="images/audio-ativo.gif" alt="VoiceUp Character" style="width: 100%; height: 100%; object-fit: contain;">'
      })
    }
  
    
    const mobileMenuBtn = document.querySelector(".mobile-menu-btn")
    const nav = document.querySelector(".nav")
  
    if (mobileMenuBtn && nav) {
      mobileMenuBtn.addEventListener("click", () => {
        mobileMenuBtn.classList.toggle("active")
        nav.classList.toggle("active")
      })
    }
  
    
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", function (e) {
        e.preventDefault()
  
        const targetId = this.getAttribute("href")
        if (targetId === "#") return
  
        const targetElement = document.querySelector(targetId)
        if (targetElement) {
          const headerHeight = document.querySelector(".header").offsetHeight
          const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight
  
          window.scrollTo({
            top: targetPosition,
            behavior: "smooth",
          })
  
          
          if (mobileMenuBtn && mobileMenuBtn.classList.contains("active")) {
            mobileMenuBtn.classList.remove("active")
            nav.classList.remove("active")
          }
        }
      })
    })
  
   
    function updateVegetableLayers() {
      const scrollPosition = window.pageYOffset
  
      document.querySelectorAll(".vegetable-layer").forEach((layer, index) => {
        const speed = (index + 1) * 0.1
        const yPos = scrollPosition * speed
        layer.style.transform = `translateY(${yPos}px)`
      })
    }
  
    window.addEventListener("scroll", () => {
      requestAnimationFrame(updateVegetableLayers)
    })
  
    
    const observerOptions = {
      root: null,
      rootMargin: "0px",
      threshold: 0.1,
    }
  
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("active")
          observer.unobserve(entry.target)
        }
      })
    }, observerOptions)
  
    document.querySelectorAll(".about-item, .feature-item, .step, .app-screenshot").forEach((el) => {
      el.classList.add("fade-in")
      observer.observe(el)
    })
  
    
    const header = document.querySelector(".header")
    let lastScrollTop = 0
  
    window.addEventListener("scroll", () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
  
      if (scrollTop > 50) {
        header.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)"
      } else {
        header.style.boxShadow = "none"
      }
  
      lastScrollTop = scrollTop
    })
  
    
    const downloadBtn = document.querySelector(".download-btn")
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        console.log("Download do VoiceUp iniciado")
        
      })
    }
  
    
    function animateCounter(element, target, duration = 2000) {
      let start = 0
      const increment = target / (duration / 16)
  
      function updateCounter() {
        start += increment
        if (start < target) {
          element.textContent = Math.floor(start)
          requestAnimationFrame(updateCounter)
        } else {
          element.textContent = target
        }
      }
  
      updateCounter()
    }
  
    
    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const statNumbers = entry.target.querySelectorAll(".stat-number")
          statNumbers.forEach((stat) => {
            const target = Number.parseInt(stat.textContent)
            if (!isNaN(target)) {
              stat.textContent = "0"
              animateCounter(stat, target)
            }
          })
          statsObserver.unobserve(entry.target)
        }
      })
    })
  
    const statsSection = document.querySelector(".stats")
    if (statsSection) {
      statsObserver.observe(statsSection)
    }
  
    
    document.addEventListener("keydown", (e) => {
      
      if (e.key === "Escape" && mobileMenuBtn && mobileMenuBtn.classList.contains("active")) {
        mobileMenuBtn.classList.remove("active")
        nav.classList.remove("active")
      }
    })
  
    console.log("VoiceUp Landing Page carregada com sucesso!")
  })
  
  
  var lottie
  
  
  var gtag
  
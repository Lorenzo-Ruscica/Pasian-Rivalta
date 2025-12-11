document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Gestione Navbar Sticky
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 30) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 2. Menu Mobile (Burger)
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    
    burger.addEventListener('click', () => {
        nav.classList.toggle('nav-active');
        
        // Cambio Icona
        if (nav.classList.contains('nav-active')) {
            burger.innerHTML = '<i class="fas fa-times"></i>'; // X
            burger.style.color = "#d4af37";
        } else {
            burger.innerHTML = '<i class="fas fa-bars"></i>'; // Burger
            burger.style.color = "#fff";
        }
    });

    // 3. Dropdown Mobile (Click invece di Hover)
    const dropdown = document.querySelector('.dropdown');
    
    if (window.innerWidth <= 968) {
        dropdown.addEventListener('click', (e) => {
            // Se clicco sul link principale "Collezioni"
            if (!e.target.closest('.dropdown-menu')) {
                e.preventDefault(); // Non ricaricare la pagina
                dropdown.classList.toggle('active'); // Mostra/Nascondi sottomenu
            }
        });
    }

    // 4. Animazioni Scroll Reveal
    const revealElements = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => observer.observe(el));
});

// --- GESTIONE COOKIE BANNER ---
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('accept-cookies');

    // Controlla se l'utente ha già accettato
    if (!localStorage.getItem('cookiesAccepted')) {
        // Se no, mostra il banner dopo 2 secondi (effetto entrata elegante)
        setTimeout(() => {
            cookieBanner.classList.add('show');
        }, 2000);
    }

    // Al click su Accetta
    acceptBtn.addEventListener('click', () => {
        // 1. Nascondi banner
        cookieBanner.classList.remove('show');
        // 2. Salva preferenza nel browser
        localStorage.setItem('cookiesAccepted', 'true');
    });
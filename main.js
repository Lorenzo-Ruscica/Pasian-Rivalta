document.addEventListener('DOMContentLoaded', () => {

   



    const burger = document.querySelector('.burger');

    const nav = document.querySelector('.nav-links');

    const dropdownLink = document.querySelector('.dropdown > a');

    const dropdownLi = document.querySelector('.dropdown');





    if (burger) {

        burger.addEventListener('click', () => {

            nav.classList.toggle('nav-active');

           



            if (nav.classList.contains('nav-active')) {

                burger.innerHTML = '<i class="fas fa-times"></i>';

                burger.style.color = "#d4af37";

            } else {

                burger.innerHTML = '<i class="fas fa-bars"></i>';

                burger.style.color = "#fff";

            }

        });

    }





    if (dropdownLink) {

        dropdownLink.addEventListener('click', (e) => {



            if (window.innerWidth <= 968) {

                e.preventDefault();

                dropdownLi.classList.toggle('mobile-active');

               



                const arrow = dropdownLink.querySelector('i');

                if (arrow) {

                    arrow.style.transform = dropdownLi.classList.contains('mobile-active')

                        ? "rotate(180deg)"

                        : "rotate(0deg)";

                }

            }

        });

    }





    const cookieBanner = document.getElementById('cookie-banner');

    const acceptBtn = document.getElementById('accept-cookies');





    if (!localStorage.getItem('cookiesAccepted')) {

        if(cookieBanner) {

            setTimeout(() => {

                cookieBanner.style.display = 'flex';



                setTimeout(() => cookieBanner.classList.add('show'), 10);

            }, 1000);

        }

    } else {



        if(cookieBanner) cookieBanner.style.display = 'none';

    }





    if (acceptBtn) {

        acceptBtn.addEventListener('click', function(e) {

            e.preventDefault();



            if(cookieBanner) {

                cookieBanner.style.display = 'none';

                cookieBanner.classList.remove('show');

            }



            localStorage.setItem('cookiesAccepted', 'true');

        });

    }





    const navbar = document.querySelector('.navbar');

    window.addEventListener('scroll', () => {

        if (window.scrollY > 30) {

            navbar.classList.add('scrolled');

        } else {

            navbar.classList.remove('scrolled');

        }

    });





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
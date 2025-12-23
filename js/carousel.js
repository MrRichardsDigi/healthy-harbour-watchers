(function(){
  const track = document.querySelector('.carousel-track');
  const imgs = Array.from(track.querySelectorAll('img'));
  const prev = document.querySelector('.carousel-btn.prev');
  const next = document.querySelector('.carousel-btn.next');
  let index = 0;
  function show(i){
    index = (i + imgs.length) % imgs.length;
    track.style.transform = `translateX(-${index * 100}%)`;
  }
  prev.addEventListener('click',()=>show(index-1));
  next.addEventListener('click',()=>show(index+1));
  let auto = setInterval(()=>show(index+1),4000);
  [prev,next].forEach(b=>b.addEventListener('click',()=>{clearInterval(auto);auto=setInterval(()=>show(index+1),4000);}));
  show(0);
})();

import React from 'react';
import openMicArt from './images/open-mic-art-night-centered.png';

export default function OpenMicFlyer() {
  return (
    <div className="w-[640px] h-[1136px] bg-[#EE3123] relative overflow-hidden box-border" style={{ fontFamily: "'Archivo Black', sans-serif" }}>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo+Narrow:wght@600;700&family=Oswald:wght@500;700&display=swap');
        .text-justify-custom { text-align: justify; text-align-last: justify; }
        .soft-edge-mask {
          mask-image: radial-gradient(circle, black 35%, transparent 68%);
          -webkit-mask-image: -webkit-radial-gradient(circle, black 35%, transparent 68%);
        }
      `}} />
      
      {/* Top Strip */}
      <div className="absolute top-[24px] left-[24px] right-[24px] flex justify-center items-center uppercase" style={{ fontFamily: "'Oswald', sans-serif" }}>
        <div className="text-black text-[16px] text-center leading-[1.1] font-bold tracking-[0.1em]">
          CAFFÈ TRIESTE<br/>
          NORTH BEACH
        </div>
      </div>

      {/* Top Headline Lockup */}
      <div className="absolute top-[65px] left-[24px] right-[24px] flex flex-col uppercase tracking-tighter text-black">
        <div className="text-[86px] leading-[0.85] text-left">OPEN MIC</div>
        <div className="text-[86px] leading-[0.85] text-right">NIGHT</div>
        
        <div className="flex items-center justify-between mt-[2px]">
          <div className="text-[86px] leading-[0.85]">OCT</div>
          
          <div className="text-black text-[12px] text-justify-custom leading-[1.15] font-bold uppercase tracking-widest w-[210px] mt-2" style={{ fontFamily: "'Archivo Narrow', sans-serif" }}>
            NERVOUS POETS AND CAPPUCCINOS. WE PROVIDE THE CREMA, YOU PROVIDE THE COURAGE.
          </div>

          <div className="text-[86px] leading-[0.85]">28</div>
        </div>
      </div>

      {/* Centered Image with soft edges */}
      <div className="absolute top-[315px] left-1/2 -translate-x-1/2 w-[540px] h-[540px]">
        <div className="w-full h-full soft-edge-mask flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(to bottom, #0F172A 0%, #0F172A 55%, #D84315 55%, #7C2D12 100%)' }}>
           {/* SVG Noise overlay for texture */}
           <svg className="absolute inset-0 w-full h-full opacity-40 pointer-events-none mix-blend-overlay z-20" xmlns="http://www.w3.org/2000/svg">
             <filter id="noiseFilter">
               <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" />
             </filter>
             <rect width="100%" height="100%" filter="url(#noiseFilter)" />
           </svg>
           <img src={openMicArt} alt="Centered Night Campfire Mic Art" className="w-[120%] h-[120%] object-cover opacity-95 relative z-10" />
        </div>
      </div>

      {/* Lower Lockup */}
      <div className="absolute top-[880px] left-[24px] right-[24px] flex flex-col uppercase tracking-tighter text-black">
        <div className="text-[100px] leading-[0.85] text-left">NORTH</div>
        <div className="flex items-center justify-between mt-[2px]">
          <div className="text-black text-[12.5px] text-justify-custom leading-[1.15] font-bold uppercase tracking-widest w-[165px] mt-2" style={{ fontFamily: "'Archivo Narrow', sans-serif" }}>
            POETRY, PROSE, AND PANIC. FIVE MINUTES OF FAME. NO REFUNDS ON APPLAUSE.
          </div>
          <div className="text-[100px] leading-[0.85] text-right">BEACH</div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-[20px] left-[24px] right-[24px] flex flex-col items-center justify-center uppercase text-center leading-tight" style={{ fontFamily: "'Oswald', sans-serif" }}>
        <div className="text-black font-bold text-[20px] tracking-widest">7:00 PM &bull; SIGN-UPS AT THE COUNTER</div>
        <div className="text-[#F4F0E6] text-[14px] font-bold tracking-widest mt-2">601 VALLEJO ST, SAN FRANCISCO</div>
      </div>

    </div>
  );
}


import { useState } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Video from './components/Video'
import About from './components/About'
import Contact from './components/Contact'
import Footer from './components/Footer'
import './App.css'
import WhySection from './components/WhySection'
import OurStory from './components/OurStory'
// TEMP: chat bot hidden while its backend is broken; restore this and <ChatWidget /> below
// import ChatWidget from './components/ChatWidget'

function App() {
  return (
    <div className="App">
      <Navbar />
      <Hero />
      <Video />
      <About />
      <WhySection />
      <OurStory />
      <Contact />
      <Footer />
      {/* <ChatWidget /> */}
    </div>
  )
}

export default App

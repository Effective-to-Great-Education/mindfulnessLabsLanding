import { useState } from 'react'
import { Instagram, Linkedin } from 'lucide-react'
import './Contact.css'

// Address shown when submitting fails, baked in at build time from .env / Netlify
const FALLBACK_EMAIL = import.meta.env.VITE_FALLBACK_EMAIL

function Contact() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: '',
    email: '',
    message: ''
  });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('');

    try {
      // Use localhost API in development, Netlify function in production
      const apiUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001/api/subscribe'
        : '/.netlify/functions/subscribe';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          role: formData.role,
          message: formData.message
        })
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setFormData({ firstName: '', lastName: '', role: '', email: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Error:', error);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  return (
    <section id="contact" className="contact-section">
      <div className="container">
        <h2 className="section-title">Stay connected with <span className="highlight">Mindfulness Labs</span></h2>
        <p className="section-subtitle">Join our mailing list to receive updates, insights, and early access.</p>
        <div className="contact-content">
          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  name="firstName"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  name="lastName"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="role">Role</label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
              >
              <option value="" disabled>Select a role</option>
              <option value="Educator">Educator</option>
              <option value="School Admin">School Admin</option>
              <option value="Funder/Investor">Funder/Investor</option>
              <option value="Collaborator/Partner">Collaborator/Partner</option>
              <option value="Student">Student</option>
              <option value="General Supporter">General Supporter</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                name="email"
                placeholder="john.doe@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                name="message"
                placeholder="Tell us about your interest in Mindfulness Labs..."
                value={formData.message}
                onChange={handleChange}
              ></textarea>
            </div>
            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? 'Sending...' : 'Submit'}
            </button>
            {status && (
              <div className={`status-message ${status}`}>
                {status === 'success'
                  ? 'Successfully subscribed to our mailing list!'
                  : (
                    // On failure, point them to the fallback address instead of asking them to retry
                    <>
                      Something went wrong. Please email us directly at{' '}
                      <a href={`mailto:${FALLBACK_EMAIL}`}>{FALLBACK_EMAIL}</a>.
                    </>
                  )}
              </div>
            )}
          </form>
          <div className="contact-social">
            <a 
              href="https://www.instagram.com/mindfulnesslabs_ai/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="contact-instagram-link"
              aria-label="Follow us on Instagram"
            >
              <Instagram size={28} strokeWidth={2} />
              <span>Follow us on Instagram</span>
            </a>

            <a 
              href="https://www.linkedin.com/company/mindfulness-labs/"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-linkedin-link"
              aria-label="Connect with us on LinkedIn"
            >
              <Linkedin size={28} strokeWidth={2} />
              <span>Connect with us on LinkedIn</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Contact

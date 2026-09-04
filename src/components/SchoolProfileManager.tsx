import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Role } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Settings, Camera, Upload, CheckCircle, Palette } from 'lucide-react';
import './managers.css';
import './SchoolProfile.css';

/* ═══════════════════════════════════════════════════════════════════
   School Profile Manager
   ═══════════════════════════════════════════════════════════════════ */



const ColorInput = ({ label, value, onChange, disabled }: { label: string, value: string, onChange: (val: string) => void, disabled: boolean }) => (
  <div className="color-field-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
    <label className="form-label" style={{ fontSize: '0.8rem', opacity: 0.8 }}>{label}</label>
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <div 
        style={{ 
          width: '36px', height: '36px', borderRadius: '50%', backgroundColor: value, 
          boxShadow: '0 0 0 2px white, 0 0 0 3px #e2e8f0', transition: 'transform 0.2s' 
        }} 
      />
      <input 
        type="color" 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '40px', height: '32px', border: 'none', background: 'transparent', cursor: 'pointer' }}
        disabled={disabled}
      />
      <div style={{ flex: 1 }}>
        <Input 
          placeholder="#000000"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  </div>
);

export const SchoolProfileManager = ({ schoolId, role }: { schoolId: string; role?: Role }) => {
  const isOwner = role === 'owner';
  const { profile, refreshProfile } = useAuth();
  const { flash, showFlash } = useFlashMessage(10000);

  const [form, setForm] = useState({
    school_name: '',
    contact: '',
    email: '',
    address: '',
    logo_url: '',
    primary_color: '#1a237e',
    secondary_color: '#947029',
    tertiary_color: '#f1f5f9',
  });

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setForm({
        school_name: profile.school_name || '',
        contact: profile.contact || '',
        email: profile.email || '',
        address: (profile as any).address || '',
        logo_url: profile.logo_url || '',
        primary_color: profile.primary_color || '#1a237e',
        secondary_color: profile.secondary_color || '#947029',
        tertiary_color: profile.tertiary_color || '#f1f5f9',
      });
    }
  }, [profile]);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showFlash('Please select an image file'); return; }
    // Increased size limit to 2MB for storage backend instead of 512KB for base64
    if (file.size > 2 * 1024 * 1024) { showFlash('Logo must be under 2 MB'); return; }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${schoolId}-${Math.random()}.${fileExt}`;
      
      const { data, error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('logos')
        .getPublicUrl(data.path);

      setForm(prev => ({ ...prev, logo_url: publicUrlData.publicUrl }));
    } catch (err: any) {
      showFlash('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.school_name.trim()) { showFlash('School name is required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        school_name: form.school_name.trim(),
        contact: form.contact.trim(),
        email: form.email.trim(),
        logo_url: form.logo_url,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        tertiary_color: form.tertiary_color,
        address: form.address.trim()
      };

      const { error } = await supabase.from('schools').update(payload).eq('id', schoolId);

      if (error) {
        if (error.code === '42703') {
           // Retry without color fields if they don't exist yet
           const basics = { ...payload };
           delete basics.primary_color;
           delete basics.secondary_color;
           delete basics.tertiary_color;
           
           const { error: retryErr } = await supabase.from('schools').update(basics).eq('id', schoolId);
           if (retryErr) throw retryErr;
           showFlash('Warning: Basic info saved, but color columns are missing in DB. See instructions to add them.');
        } else {
          throw error;
        }
      } else {
        showFlash('School profile and branding updated successfully');
      }

      await refreshProfile();
    } catch (err: any) {
      showFlash('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    form.school_name !== (profile?.school_name || '') ||
    form.contact !== (profile?.contact || '') ||
    form.email !== (profile?.email || '') ||
    form.address !== ((profile as any)?.address || '') ||
    form.logo_url !== (profile?.logo_url || '') ||
    form.primary_color !== (profile?.primary_color || '#1a237e') ||
    form.secondary_color !== (profile?.secondary_color || '#947029') ||
    form.tertiary_color !== (profile?.tertiary_color || '#f1f5f9');

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <Settings size={24} />
          <div>
            <h3>School Profile</h3>
            <p>Manage branding and contact information</p>
          </div>
        </div>
      </div>

      {flash && (
        <div className={'flash ' + (flash.includes('Error') || flash.includes('missing') ? 'error' : 'success')}>
          <span>{flash}</span>
        </div>
      )}

      <div className="profile-card">
        <div className="profile-logo-section">
          <div className="profile-logo-preview">
            {form.logo_url ? <img src={form.logo_url} alt="Logo" className="profile-logo-img" /> : <Camera size={28} />}
          </div>
          {isOwner && (
            <div className="profile-logo-actions">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoSelect} style={{ display: 'none' }} />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} isLoading={uploading}>
                <Upload size={14} /> Upload Logo
              </Button>
            </div>
          )}
        </div>

        <div className="profile-divider" />

        <div className="profile-form">
          <div className="form-section-label">General Information</div>
          <div className="form-grid">
            <div className="span-2"><Input label="School Name" value={form.school_name} onChange={handleChange('school_name')} required disabled={!isOwner} /></div>
            <Input label="Contact" value={form.contact} onChange={handleChange('contact')} disabled={!isOwner} />
            <Input label="Email" value={form.email} onChange={handleChange('email')} disabled={!isOwner} />
            <div className="span-2"><label className="form-label">Address</label><textarea className="form-textarea" rows={2} value={form.address} onChange={handleChange('address')} disabled={!isOwner} /></div>
          </div>
        </div>

        <div className="profile-divider" />

        <div className="profile-form">
          <div className="form-section-label"><Palette size={16} /> Brand Identity</div>
          <div className="form-grid">
            <ColorInput label="Primary Color (Main Borders)" value={form.primary_color} onChange={(v)=>setForm(p=>({...p, primary_color: v}))} disabled={!isOwner} />
            <ColorInput label="Secondary Color (Headers)" value={form.secondary_color} onChange={(v)=>setForm(p=>({...p, secondary_color: v}))} disabled={!isOwner} />
            <ColorInput label="Tertiary Color (Accents)" value={form.tertiary_color} onChange={(v)=>setForm(p=>({...p, tertiary_color: v}))} disabled={!isOwner} />
          </div>
        </div>

        <div className="profile-divider" />

        {isOwner && (
          <div className="profile-save-row">
            <Button onClick={handleSave} isLoading={saving} disabled={!hasChanges} size="lg">
              <CheckCircle size={18} /> Save All Changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

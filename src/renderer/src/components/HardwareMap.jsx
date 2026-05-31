/**
 * Airone AI Backbone - Hardware Map Component
 * Visual pin mapping and configuration for the robot.
 * Displays input/output pin stats, pin table with descriptions,
 * and supports syncing pins from .airo files.
 */

import React, { useState, useEffect } from 'react';

// Default ESP32 pins for new robots
const DEFAULT_PINS = [
  { name: 'ledpin', number: 2, mode: 'output', description: 'Built-in LED' },
  { name: 'urhands', number: 13, mode: 'output', description: 'Servo - Right hand' },
  { name: 'ulhands', number: 12, mode: 'output', description: 'Servo - Left hand' },
  { name: 'llleg', number: 14, mode: 'output', description: 'Servo - Left leg' },
  { name: 'ultrasonic', number: 35, mode: 'input', description: 'Ultrasonic distance sensor' },
  { name: 'temperature_sensor', number: 34, mode: 'input', description: 'Temperature sensor' },
  { name: 'camera', number: 36, mode: 'input', description: 'Camera module' },
  { name: 'microphone', number: 39, mode: 'input', description: 'Microphone - voice commands' }
];

function HardwareMap() {
  const [pins, setPins] = useState([]);
  const [robotId, setRobotId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const robots = await window.aironeAPI.getAllRobots();
      if (robots && robots.length > 0) {
        const first = robots[0];
        setRobotId(first.id);
        const result = await window.aironeAPI.getPins(first.id);
        setPins(result || []);
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  };

  const handleUpdateDescription = async (pinId) => {
    const pin = pins.find(p => p.id === pinId);
    if (pin) {
      try {
        await window.aironeAPI.updatePinDescription(pinId, pin.description);
        setError(null);
      } catch (e) {
        setError('Failed to save description: ' + e.message);
      }
    }
  };

  const handleSyncDefault = async () => {
    if (!robotId) return;
    setSyncing(true);
    setError(null);
    try {
      await window.aironeAPI.syncPins(robotId, DEFAULT_PINS);
      setSuccess(true);
      setError(null);
      const result = await window.aironeAPI.getPins(robotId);
      setPins(result || []);
    } catch (e) {
      setError('Sync failed: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleImportAiro = async () => {
    setImporting(true);
    setError(null);
    try {
      const result = await window.aironeAPI.openAiroFile();
      if (result && result.pins && result.pins.length > 0) {
        if (robotId) {
          await window.aironeAPI.syncPins(robotId, result.pins);
          const updated = await window.aironeAPI.getPins(robotId);
          setPins(updated || []);
          setSuccess(true);
        }
      } else if (result) {
        setError('No pin definitions found in the .airo file.');
      }
    } catch (e) {
      setError('Import failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const inputCount = pins.filter(p => p.mode === 'input').length;
  const outputCount = pins.filter(p => p.mode === 'output').length;

  return (
    <div className="hardware-map fade-in">
      <div className="page-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" />
          <line x1="20" y1="14" x2="23" y2="14" />
          <line x1="1" y1="9" x2="4" y2="9" />
          <line x1="1" y1="14" x2="4" y2="14" />
        </svg>
        <h2>Hardware Map</h2>
      </div>

      {pins.length > 0 && (
        <div className="hw-stats">
          <div className="hw-stat">
            <span className="hw-stat-value">{pins.length}</span>
            <span className="hw-stat-label">Total Pins</span>
          </div>
          <div className="hw-stat">
            <span className="hw-stat-value">{inputCount}</span>
            <span className="hw-stat-label">Inputs</span>
          </div>
          <div className="hw-stat">
            <span className="hw-stat-value">{outputCount}</span>
            <span className="hw-stat-label">Outputs</span>
          </div>
        </div>
      )}

      <div className="hw-actions">
        <button className="btn btn-secondary" onClick={handleSyncDefault} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Default ESP32 Pins'}
        </button>
        <button className="btn btn-secondary" onClick={handleImportAiro} disabled={importing}>
          {importing ? 'Importing...' : 'Import from .airo File'}
        </button>
      </div>

      {pins.length > 0 ? (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Pin Definitions</h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pin Name</th>
                  <th>GPIO</th>
                  <th>Mode</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {pins.map(pin => (
                  <tr key={pin.id}>
                    <td><span className="pin-name">{pin.pin_name}</span></td>
                    <td><span className="pin-gpio">GPIO {pin.pin_number}</span></td>
                    <td>
                      <span className={`chip ${pin.mode === 'input' ? 'chip-blue' : 'chip-orange'}`}>
                        {pin.mode}
                      </span>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input pin-desc-input"
                        value={pin.description || ''}
                        onChange={(e) => {
                          const updated = pins.map(p =>
                            p.id === pin.id ? { ...p, description: e.target.value } : p
                          );
                          setPins(updated);
                        }}
                        onBlur={() => handleUpdateDescription(pin.id)}
                        placeholder="Add description..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="alert alert-info">
            No pins configured yet. Click "Sync Default ESP32 Pins" to load the default pin configuration,
            or "Import from .airo File" to extract pins from your robot code.
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginTop: 16 }}>
          ✗ {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginTop: 16 }}>
          ✓ Pin configuration synced successfully!
        </div>
      )}
    </div>
  );
}

export default HardwareMap;

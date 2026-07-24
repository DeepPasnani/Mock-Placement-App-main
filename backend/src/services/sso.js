const { query } = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const axios = require('axios');

let ldapClient = null;

function getLdapClient() {
  if (ldapClient) return ldapClient;
  if (!process.env.LDAP_URL) return null;
  try {
    const ldap = require('ldapjs');
    ldapClient = ldap.createClient({ url: process.env.LDAP_URL });
    return ldapClient;
  } catch {
    logger.warn('ldapjs not available');
    return null;
  }
}

function signToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

async function initiateSSO(req, res) {
  const provider = process.env.SSO_PROVIDER || 'google';
  if (provider === 'saml') {
    const state = uuidv4();
    const relayState = req.body.redirect || '/student';
    await query(
      `INSERT INTO sso_states (provider, state, data, expires_at)
       VALUES ('saml', $1, $2, NOW() + INTERVAL '10 minutes')`,
      [state, JSON.stringify({ relayState })]
    );
    const samlEntry = process.env.SAML_ENTRY_POINT;
    const samlIssuer = process.env.SAML_ISSUER;
    if (!samlEntry) return res.status(400).json({ error: 'SAML not configured' });
    const samlReq = `<?xml version="1.0"?><samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="${state}" IssueInstant="${new Date().toISOString()}" Version="2.0" Destination="${samlEntry}" AssertionConsumerServiceURL="${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/sso/callback"><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${samlIssuer}</saml:Issuer></samlp:AuthnRequest>`;
    const encoded = Buffer.from(samlReq).toString('base64');
    return res.json({ redirectUrl: `${samlEntry}?SAMLRequest=${encodeURIComponent(encoded)}&RelayState=${state}` });
  }
  if (provider === 'ldap') {
    return res.json({ method: 'ldap', message: 'Use POST /api/auth/sso/callback with { username, password }' });
  }
  return res.status(400).json({ error: 'Unknown SSO provider' });
}

async function ssoCallback(req, res) {
  const provider = process.env.SSO_PROVIDER || 'google';
  try {
    if (provider === 'saml') {
      const { SAMLResponse, RelayState } = req.body;
      if (!SAMLResponse) return res.status(400).json({ error: 'Missing SAMLResponse' });
      const cert = process.env.SAML_CERT;
      if (cert) {
        try {
          const crypto = require('crypto');
          const verify = crypto.createVerify('SHA256');
          verify.update(SAMLResponse);
          if (!verify.verify(cert, Buffer.from(SAMLResponse, 'base64'))) {
            logger.warn('SAML response verification failed');
          }
        } catch (e) {
          logger.error({ err: e }, 'SAML cert verify error');
        }
      }
      const decoded = Buffer.from(SAMLResponse, 'base64').toString('utf-8');
      let email = '';
      let name = '';
      const nameIdMatch = decoded.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
      if (nameIdMatch) email = nameIdMatch[1];
      const attrMatch = decoded.match(/<saml:Attribute Name="([^"]+)"[^>]*>[\s\S]*?<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/g);
      if (attrMatch) {
        for (const attr of attrMatch) {
          if (attr.includes('email') || attr.includes('Email')) {
            const valMatch = attr.match(/<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/);
            if (valMatch) email = valMatch[1];
          }
          if (attr.includes('name') || attr.includes('Name') || attr.includes('cn')) {
            const valMatch = attr.match(/<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/);
            if (valMatch) name = valMatch[1];
          }
        }
      }
      if (!email) return res.status(400).json({ error: 'Could not extract email from SAML response' });
      return await findOrCreateUser(res, email, name, 'saml');
    }
    if (provider === 'ldap') {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
      const client = getLdapClient();
      if (!client) return res.status(500).json({ error: 'LDAP not configured' });
      const baseDN = process.env.LDAP_BASE_DN || 'dc=example,dc=com';
      return new Promise((resolve) => {
        client.bind(`uid=${username},${baseDN}`, password, async (err) => {
          if (err) {
            logger.error({ err }, 'LDAP bind failed');
            return resolve(res.status(401).json({ error: 'LDAP authentication failed' }));
          }
          const email = `${username}@${process.env.LDAP_DOMAIN || 'institution.edu'}`;
          try {
            await findOrCreateUser(res, email, username, 'ldap');
          } catch (e) {
            resolve(res.status(500).json({ error: 'User creation failed' }));
          }
          resolve();
        });
      });
    }
    return res.status(400).json({ error: 'Unknown SSO provider' });
  } catch (err) {
    logger.error({ err }, 'SSO callback error');
    res.status(500).json({ error: 'SSO callback failed' });
  }
}

async function findOrCreateUser(res, email, name, provider) {
  email = email.toLowerCase().trim();
  const existing = await query('SELECT id, name, email, role, is_active, avatar_url FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    const user = existing.rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated' });
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const token = signToken(user.id, user.role);
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url } });
  }
  const result = await query(
    `INSERT INTO users (name, email, role, is_active) VALUES ($1, $2, 'student', true)
     RETURNING id, name, email, role, avatar_url`,
    [name || email.split('@')[0], email]
  );
  const user = result.rows[0];
  const token = signToken(user.id, user.role);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url } });
}

module.exports = { initiateSSO, ssoCallback };

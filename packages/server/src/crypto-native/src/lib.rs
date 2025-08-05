use neon::prelude::*;
use ring::{aead, pbkdf2, rand};
use x25519_dalek::{EphemeralSecret, PublicKey};
use ed25519_dalek::{Keypair, Signature, Signer, Verifier};
use hkdf::Hkdf;
use sha2::Sha256;
use aes_gcm::{Aes256Gcm, Key, Nonce, aead::{Aead, NewAead}};
use std::num::NonZeroU32;

/// Generate X25519 key pair for ECDH
fn generate_x25519_keypair(mut cx: FunctionContext) -> JsResult<JsObject> {
    let secret = EphemeralSecret::new(&mut rand::SystemRandom::new());
    let public = PublicKey::from(&secret);
    
    let result = cx.empty_object();
    let secret_bytes = cx.buffer(32)?;
    let public_bytes = cx.buffer(32)?;
    
    // Copy secret and public key bytes
    cx.borrow_mut(&secret_bytes, |data| {
        data.as_mut_slice().copy_from_slice(&secret.to_bytes());
    });
    
    cx.borrow_mut(&public_bytes, |data| {
        data.as_mut_slice().copy_from_slice(public.as_bytes());
    });
    
    result.set(&mut cx, "secretKey", secret_bytes)?;
    result.set(&mut cx, "publicKey", public_bytes)?;
    
    Ok(result)
}

/// Generate Ed25519 key pair for signing
fn generate_ed25519_keypair(mut cx: FunctionContext) -> JsResult<JsObject> {
    let mut csprng = rand::SystemRandom::new();
    let keypair = Keypair::generate(&mut csprng);
    
    let result = cx.empty_object();
    let secret_bytes = cx.buffer(64)?;
    let public_bytes = cx.buffer(32)?;
    
    cx.borrow_mut(&secret_bytes, |data| {
        data.as_mut_slice().copy_from_slice(&keypair.to_bytes());
    });
    
    cx.borrow_mut(&public_bytes, |data| {
        data.as_mut_slice().copy_from_slice(keypair.public.as_bytes());
    });
    
    result.set(&mut cx, "secretKey", secret_bytes)?;
    result.set(&mut cx, "publicKey", public_bytes)?;
    
    Ok(result)
}

/// Perform X25519 ECDH key exchange
fn x25519_ecdh(mut cx: FunctionContext) -> JsResult<JsBuffer> {
    let secret_buffer = cx.argument::<JsBuffer>(0)?;
    let public_buffer = cx.argument::<JsBuffer>(1)?;
    
    let secret_bytes = cx.borrow(&secret_buffer, |data| {
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(data.as_slice());
        bytes
    });
    
    let public_bytes = cx.borrow(&public_buffer, |data| {
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(data.as_slice());
        bytes
    });
    
    let secret = EphemeralSecret::from(secret_bytes);
    let public = PublicKey::from(public_bytes);
    let shared_secret = secret.diffie_hellman(&public);
    
    let result = cx.buffer(32)?;
    cx.borrow_mut(&result, |data| {
        data.as_mut_slice().copy_from_slice(shared_secret.as_bytes());
    });
    
    Ok(result)
}

/// HKDF key derivation
fn hkdf_expand(mut cx: FunctionContext) -> JsResult<JsBuffer> {
    let salt_buffer = cx.argument::<JsBuffer>(0)?;
    let ikm_buffer = cx.argument::<JsBuffer>(1)?;
    let info_buffer = cx.argument::<JsBuffer>(2)?;
    let length = cx.argument::<JsNumber>(3)?.value(&mut cx) as usize;
    
    let salt = cx.borrow(&salt_buffer, |data| data.as_slice().to_vec());
    let ikm = cx.borrow(&ikm_buffer, |data| data.as_slice().to_vec());
    let info = cx.borrow(&info_buffer, |data| data.as_slice().to_vec());
    
    let hk = Hkdf::<Sha256>::new(Some(&salt), &ikm);
    let mut okm = vec![0u8; length];
    hk.expand(&info, &mut okm).map_err(|_| {
        cx.throw_error("HKDF expansion failed")
    })?;
    
    let result = cx.buffer(length)?;
    cx.borrow_mut(&result, |data| {
        data.as_mut_slice().copy_from_slice(&okm);
    });
    
    Ok(result)
}

/// AES-256-GCM encryption
fn aes_encrypt(mut cx: FunctionContext) -> JsResult<JsObject> {
    let key_buffer = cx.argument::<JsBuffer>(0)?;
    let nonce_buffer = cx.argument::<JsBuffer>(1)?;
    let plaintext_buffer = cx.argument::<JsBuffer>(2)?;
    let aad_buffer = cx.argument::<JsBuffer>(3)?;
    
    let key_bytes = cx.borrow(&key_buffer, |data| {
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(data.as_slice());
        bytes
    });
    
    let nonce_bytes = cx.borrow(&nonce_buffer, |data| {
        let mut bytes = [0u8; 12];
        bytes.copy_from_slice(data.as_slice());
        bytes
    });
    
    let plaintext = cx.borrow(&plaintext_buffer, |data| data.as_slice().to_vec());
    let aad = cx.borrow(&aad_buffer, |data| data.as_slice().to_vec());
    
    let key = Key::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = cipher.encrypt(nonce, plaintext.as_ref())
        .map_err(|_| cx.throw_error("Encryption failed"))?;
    
    let result = cx.empty_object();
    let ciphertext_buffer = cx.buffer(ciphertext.len())?;
    
    cx.borrow_mut(&ciphertext_buffer, |data| {
        data.as_mut_slice().copy_from_slice(&ciphertext);
    });
    
    result.set(&mut cx, "ciphertext", ciphertext_buffer)?;
    
    Ok(result)
}

/// AES-256-GCM decryption
fn aes_decrypt(mut cx: FunctionContext) -> JsResult<JsBuffer> {
    let key_buffer = cx.argument::<JsBuffer>(0)?;
    let nonce_buffer = cx.argument::<JsBuffer>(1)?;
    let ciphertext_buffer = cx.argument::<JsBuffer>(2)?;
    let aad_buffer = cx.argument::<JsBuffer>(3)?;
    
    let key_bytes = cx.borrow(&key_buffer, |data| {
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(data.as_slice());
        bytes
    });
    
    let nonce_bytes = cx.borrow(&nonce_buffer, |data| {
        let mut bytes = [0u8; 12];
        bytes.copy_from_slice(data.as_slice());
        bytes
    });
    
    let ciphertext = cx.borrow(&ciphertext_buffer, |data| data.as_slice().to_vec());
    let aad = cx.borrow(&aad_buffer, |data| data.as_slice().to_vec());
    
    let key = Key::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let plaintext = cipher.decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| cx.throw_error("Decryption failed"))?;
    
    let result = cx.buffer(plaintext.len())?;
    cx.borrow_mut(&result, |data| {
        data.as_mut_slice().copy_from_slice(&plaintext);
    });
    
    Ok(result)
}

/// Ed25519 signature creation
fn ed25519_sign(mut cx: FunctionContext) -> JsResult<JsBuffer> {
    let keypair_buffer = cx.argument::<JsBuffer>(0)?;
    let message_buffer = cx.argument::<JsBuffer>(1)?;
    
    let keypair_bytes = cx.borrow(&keypair_buffer, |data| {
        let mut bytes = [0u8; 64];
        bytes.copy_from_slice(data.as_slice());
        bytes
    });
    
    let message = cx.borrow(&message_buffer, |data| data.as_slice().to_vec());
    
    let keypair = Keypair::from_bytes(&keypair_bytes)
        .map_err(|_| cx.throw_error("Invalid keypair"))?;
    
    let signature = keypair.sign(&message);
    
    let result = cx.buffer(64)?;
    cx.borrow_mut(&result, |data| {
        data.as_mut_slice().copy_from_slice(&signature.to_bytes());
    });
    
    Ok(result)
}

/// Ed25519 signature verification
fn ed25519_verify(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let public_key_buffer = cx.argument::<JsBuffer>(0)?;
    let message_buffer = cx.argument::<JsBuffer>(1)?;
    let signature_buffer = cx.argument::<JsBuffer>(2)?;
    
    let public_key_bytes = cx.borrow(&public_key_buffer, |data| {
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(data.as_slice());
        bytes
    });
    
    let message = cx.borrow(&message_buffer, |data| data.as_slice().to_vec());
    
    let signature_bytes = cx.borrow(&signature_buffer, |data| {
        let mut bytes = [0u8; 64];
        bytes.copy_from_slice(data.as_slice());
        bytes
    });
    
    let public_key = ed25519_dalek::PublicKey::from_bytes(&public_key_bytes)
        .map_err(|_| cx.throw_error("Invalid public key"))?;
    
    let signature = Signature::from_bytes(&signature_bytes)
        .map_err(|_| cx.throw_error("Invalid signature"))?;
    
    let is_valid = public_key.verify(&message, &signature).is_ok();
    
    Ok(cx.boolean(is_valid))
}

/// PBKDF2 key derivation
fn pbkdf2_derive(mut cx: FunctionContext) -> JsResult<JsBuffer> {
    let password_buffer = cx.argument::<JsBuffer>(0)?;
    let salt_buffer = cx.argument::<JsBuffer>(1)?;
    let iterations = cx.argument::<JsNumber>(2)?.value(&mut cx) as u32;
    let output_length = cx.argument::<JsNumber>(3)?.value(&mut cx) as usize;
    
    let password = cx.borrow(&password_buffer, |data| data.as_slice().to_vec());
    let salt = cx.borrow(&salt_buffer, |data| data.as_slice().to_vec());
    
    let mut output = vec![0u8; output_length];
    
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        NonZeroU32::new(iterations).unwrap(),
        &salt,
        &password,
        &mut output,
    );
    
    let result = cx.buffer(output_length)?;
    cx.borrow_mut(&result, |data| {
        data.as_mut_slice().copy_from_slice(&output);
    });
    
    Ok(result)
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("generateX25519Keypair", generate_x25519_keypair)?;
    cx.export_function("generateEd25519Keypair", generate_ed25519_keypair)?;
    cx.export_function("x25519Ecdh", x25519_ecdh)?;
    cx.export_function("hkdfExpand", hkdf_expand)?;
    cx.export_function("aesEncrypt", aes_encrypt)?;
    cx.export_function("aesDecrypt", aes_decrypt)?;
    cx.export_function("ed25519Sign", ed25519_sign)?;
    cx.export_function("ed25519Verify", ed25519_verify)?;
    cx.export_function("pbkdf2Derive", pbkdf2_derive)?;
    Ok(())
}

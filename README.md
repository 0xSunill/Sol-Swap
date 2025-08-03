# 🔁 Solana Token Swap Program

A simple and efficient token swapping smart contract built on **Solana** using **Anchor**. This program allows two users to swap tokens directly with each other at a 1:1 ratio, with minimal fees and secure vault-based escrow.

---

## 🚀 How It Works

1. **User A** creates a swap offer:
   - Deposits Token A into a **vault** (a token account controlled by a PDA).
   - Specifies the amount and the token they want in return (Token B).

2. **User B** accepts the offer:
   - Deposits the exact amount of Token B.
   - Triggers the program to execute the swap.

3. **Program Execution**:
   - Token B is sent to User A.
   - Token A is released from the vault and sent to User B.
   - Vault is closed and the swap offer is deleted.
   - Both users receive the same amount they offered—no fees, no slippage.

---

## 📦 Program Structure

### 📁 Accounts

- `SwapOffer` – Stores details like initializer, token mints, and amount.
- `Vault` – Holds Token A safely under program control.
- `Authority (PDA)` – Has authority over the vault.
- `User Token Accounts` – Standard SPL token accounts for both users.

---
<!-- 
## 🧪 Usage Example (Anchor)

### 🔧 Initialize Swap

```ts
await program.rpc.initializeSwap(
  amount,
  {
    accounts: {
      initializer: userA.publicKey,
      initializerDepositTokenAccount: userATokenA,
      vaultAccount: vaultPDA,
      swapOffer: swapOfferPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    },
    signers: [userA],
  }
); -->

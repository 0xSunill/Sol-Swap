use anchor_lang::prelude::*;
pub mod contexts;
pub use contexts::*;


pub mod state;
pub use state::*;

pub mod error;
declare_id!("H959Jtz2FKx71J2oFfJb1R7uGyuXBpgHZpp9cimtqX2c");

#[program]
pub mod swap {
    use super::*;
    pub fn make(ctx: Context<Make>, seed: u64, deposit: u64, receive: u64) -> Result<()> {
        ctx.accounts.deposit(deposit)?;
        ctx.accounts.save_escrow(seed, receive, &ctx.bumps)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        ctx.accounts.refund_and_close_vault()
    }

    pub fn take(ctx: Context<Take>) -> Result<()> {
        ctx.accounts.deposit()?;
        ctx.accounts.withdraw_and_close_vault()
    }
}

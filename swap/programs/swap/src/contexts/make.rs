use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::Escrow;

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Make<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub mint_a: InterfaceAccount<'info, Mint>,

    #[account(mint::token_program = token_program)]
    pub mint_b: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = maker,
        associated_token::token_program = token_program
    )]
    pub maker_ata_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = maker,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        init,
        payer = maker,
        associated_token::mint = mint_a,
        associated_token::authority = escrow,
        associated_token::token_program = token_program

    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> Make<'info> {
    pub fn save_escrow(&mut self, seed: u64, receive: u64, bumps: &MakeBumps) -> Result<()> {
        self.escrow.set_inner(Escrow {
            seed,
            maker: self.maker.key(),
            mint_a: self.mint_a.key(),
            mint_b: self.mint_b_key(),
            receive,
            bump: bumps.escrow,
        });
        Ok(())
    }
}

// pub fn send_offered_tokens_to_vault(
//     ctx: &Context<MakeOffer>,
//     token_a_offered_amount: u64,
// ) -> Result<()> {
//     transfer_token(
//         &ctx.accounts.maker_token_account_a,
//         &ctx.accounts.vault,
//         &token_a_offered_amount,
//         &ctx.accounts.token_mint_a,
//         &ctx.accounts.maker,
//         &ctx.accounts.token_program,
//     )?;
//     Ok(())
// }

// pub fn save_offer(ctx: Context<MakeOffer>, id: u64, token_b_wanted_amount: u64) -> Result<()> {
//     ctx.accounts.offer.set_inner(Offer {
//         id,
//         maker: ctx.accounts.maker.key(),
//         token_mint_a: ctx.accounts.token_mint_a.key(),
//         token_mint_b: ctx.accounts.token_mint_b.key(),
//         token_b_wanted_amount,
//         bump: ctx.bumps.offer,
//     });

//     Ok(())
// }

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::{errors::AppError, state::Pool};

pub fn swap(
    ctx: Context<Swap>,
    swap_a: bool,
    input_amount: u64,
    min_output_amount: u64,
) -> Result<()> {
    let pool_a = &ctx.accounts.pool_account_a;
    let pool_b = &ctx.accounts.pool_account_b;

    let authority_bump = ctx.bumps.pool_authority;

    let authority_seeds = &[
        &ctx.accounts.pool.amm.to_bytes(),
        &ctx.accounts.pool.mint_a.to_bytes(),
        &ctx.accounts.pool.mint_b.to_bytes(),
        b"authority".as_ref(),
        &[authority_bump],
    ];

    let signer_seeds = &[&authority_seeds[..]];

    if swap_a {
        // swap token A for token B
        let output_amount = pool_b.amount.checked_mul(input_amount).unwrap() / pool_a.amount;
        require!(output_amount >= min_output_amount, AppError::OutputTooSmall);
        // transfer token A from trader to pool
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader_account_a.to_account_info(),
                    to: ctx.accounts.pool_account_a.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            input_amount,
        )?;
        // transfer token B from pool to trader
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_account_b.to_account_info(),
                    to: ctx.accounts.trader_account_b.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
                signer_seeds,
            ),
            output_amount,
        )?;
    } else {
        // swap token B for token A
        let output_amount = pool_a.amount.checked_mul(input_amount).unwrap() / pool_b.amount;
        require!(output_amount >= min_output_amount, AppError::OutputTooSmall);
        // transfer token B from trader to pool
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader_account_b.to_account_info(),
                    to: ctx.accounts.pool_account_b.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            input_amount,
        )?;
        // transfer token A from pool to trader
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_account_a.to_account_info(),
                    to: ctx.accounts.trader_account_a.to_account_info(),
                    authority: ctx.accounts.pool_authority.to_account_info(),
                },
                signer_seeds,
            ),
            output_amount,
        )?;
    }

    // transfer token A from trader to pool

    // transfer token B from pool to trader

    // transfer fee from trader to pool

    Ok(())
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    // more accounts
    #[account(
        mut,
        seeds = [
            pool.amm.key().as_ref(),
            pool.mint_a.key().as_ref(),
            pool.mint_b.key().as_ref()
        ],
        bump,
        has_one = mint_a,
        has_one = mint_b
    )]
    pool: Box<Account<'info, Pool>>,

    /// CHECK read-only account
    #[account(
        seeds = [
            pool.amm.key().as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(),
            b"authority"
        ],
        bump
    )]
    pub pool_authority: AccountInfo<'info>,

    pub mint_a: Box<Account<'info, Mint>>,

    pub mint_b: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = pool_authority,
    )]
    pool_account_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = pool_authority,
    )]
    pool_account_b: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = trader,
    )]
    trader_account_a: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = trader,
    )]
    trader_account_b: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{error::AppError, StakeInfo, REWARD_VAULT_SEED, STAKE_INFO_SEED};

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>, // What happens if the staker provided is not the original creator of the stake information?

    pub mint: Account<'info, Mint>, // What happens if the provided mint address does not match the mint address in the stake information?

    #[account(
        mut,
        seeds = [STAKE_INFO_SEED, staker.key().as_ref()],
        bump,
    )]
    pub stake_info: Account<'info, StakeInfo>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = stake_info,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [REWARD_VAULT_SEED],
        bump,
        token::mint = mint,
        token::authority = reward_vault,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = staker,
    )]
    pub staker_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
    let stake_info = &ctx.accounts.stake_info;

    if !stake_info.is_staked {
        return Err(AppError::NotStaked.into());
    }

    require!(
        amount.gt(&0) && amount.le(&stake_info.amount),
        AppError::InvalidAmount
    );

    let clock = Clock::get()?;

    let slot_passed = clock.slot - stake_info.stake_at;

    let stake_amount = stake_info.amount;

    let reward_per_slot = stake_amount
        .checked_mul(100)
        .and_then(|x| x.checked_div(10_000))
        .unwrap();

    let reward = slot_passed.checked_mul(reward_per_slot).unwrap();

    msg!("reward: {}", reward);

    if reward.gt(&0) {
        // transfer reward to staker
        let reward_vault_bump = ctx.bumps.reward_vault;
        let reward_vault_signer_seeds: &[&[&[u8]]] = &[&[REWARD_VAULT_SEED, &[reward_vault_bump]]];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.reward_vault.to_account_info(),
                    to: ctx.accounts.staker_token_account.to_account_info(),
                    authority: ctx.accounts.reward_vault.to_account_info(),
                },
                reward_vault_signer_seeds,
            ),
            reward,
        )?;
    }

    // transfer token to vault
    let stake_info_bump = ctx.bumps.stake_info;
    let staker_key = ctx.accounts.staker.key();
    let stake_info_signer_seeds: &[&[&[u8]]] =
        &[&[STAKE_INFO_SEED, staker_key.as_ref(), &[stake_info_bump]]];

    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.staker_token_account.to_account_info(),
                authority: ctx.accounts.stake_info.to_account_info(),
            },
            stake_info_signer_seeds,
        ),
        amount,
    )?;

    // update stake_info
    let stake_info = &mut ctx.accounts.stake_info;

    stake_info.stake_at = clock.slot;
    stake_info.amount = stake_info.amount.checked_sub(amount).unwrap();

    if stake_info.amount.eq(&0) {
        stake_info.is_staked = false;
        // close vault_token_account
        anchor_spl::token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: ctx.accounts.vault_token_account.to_account_info(),
                destination: ctx.accounts.staker.to_account_info(),
                authority: ctx.accounts.stake_info.to_account_info(),
            },
            stake_info_signer_seeds,
        ))?;

        // close stake_info account
        ctx.accounts
            .stake_info
            .close(ctx.accounts.staker.to_account_info())?;
    }

    Ok(())
}

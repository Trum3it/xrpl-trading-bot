import { IUser, createDefaultUser } from '../database/models';
import { User, UserModel } from '../database/user';
import { generateWallet } from '../xrpl/wallet';

/**
 * Create a new user with wallet
 */
export async function createUser(userId: string): Promise<IUser> {
    // Check if user already exists
    const existing = await User.findOne({ userId });
    if (existing) {
        throw new Error(`User ${userId} already exists`);
    }

    // Generate wallet
    const walletInfo = generateWallet();

    if (!walletInfo.seed) {
        throw new Error('Failed to generate wallet seed');
    }

    // Create user
    const user = createDefaultUser(
        userId,
        walletInfo.walletAddress,
        walletInfo.seed,
        walletInfo.publicKey,
        walletInfo.privateKey
    );

    // Save user
    const userModel = new UserModel(user);
    await userModel.save();

    return user;
}


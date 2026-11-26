using System.Security.Cryptography;
using System.Text;
using ACScan2Print.Agent.Core.Interfaces;

namespace ACScan2Print.Agent.Infrastructure.Windows;

public class DpapiStorage : IDpapiStorage
{
    private readonly string _storageDirectory;
    private readonly string _legacyStorageDirectory;
    private static readonly byte[] Entropy = "ACScan2Print-DeviceIdentity-Entropy-v1"u8.ToArray();

    public DpapiStorage()
    {
        // ProgramData + LocalMachine scope is required so both the Windows Service (Session 0 LocalSystem)
        // and interactive Admin Tray enrollment UI can share and decrypt the device credential.
        _storageDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "ACScan2Print",
            "Security"
        );
        Directory.CreateDirectory(_storageDirectory);

        _legacyStorageDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ACScan2Print",
            "Security"
        );
    }

    public void SaveProtectedSecret(string key, string plaintext)
    {
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Key cannot be empty", nameof(key));
        if (string.IsNullOrEmpty(plaintext)) throw new ArgumentException("Secret cannot be empty", nameof(plaintext));

        byte[] plainBytes = Encoding.UTF8.GetBytes(plaintext);
        byte[] encrypted = ProtectedData.Protect(plainBytes, Entropy, DataProtectionScope.LocalMachine);

        string filePath = GetFilePath(_storageDirectory, key);
        File.WriteAllBytes(filePath, encrypted);
    }

    public string? LoadProtectedSecret(string key)
    {
        string machineFilePath = GetFilePath(_storageDirectory, key);
        if (File.Exists(machineFilePath))
        {
            try
            {
                byte[] encrypted = File.ReadAllBytes(machineFilePath);
                byte[] decrypted = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.LocalMachine);
                return Encoding.UTF8.GetString(decrypted);
            }
            catch
            {
                // Fall through to legacy CurrentUser path if needed
            }
        }

        string legacyFilePath = GetFilePath(_legacyStorageDirectory, key);
        if (!File.Exists(legacyFilePath)) return null;

        try
        {
            byte[] encrypted = File.ReadAllBytes(legacyFilePath);
            byte[] decrypted = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(decrypted);
        }
        catch
        {
            return null;
        }
    }

    public void ClearSecret(string key)
    {
        string machineFilePath = GetFilePath(_storageDirectory, key);
        if (File.Exists(machineFilePath))
        {
            File.Delete(machineFilePath);
        }

        string legacyFilePath = GetFilePath(_legacyStorageDirectory, key);
        if (File.Exists(legacyFilePath))
        {
            File.Delete(legacyFilePath);
        }
    }

    private static string GetFilePath(string baseDirectory, string key)
    {
        string safeKey = Convert.ToBase64String(Encoding.UTF8.GetBytes(key)).Replace('/', '_');
        return Path.Combine(baseDirectory, $"{safeKey}.dat");
    }
}

using System.Security.Cryptography;
using System.Text;
using ACScan2Print.Agent.Core.Interfaces;

namespace ACScan2Print.Agent.Infrastructure.Windows;

public class DpapiStorage : IDpapiStorage
{
    private readonly string _storageDirectory;
    private static readonly byte[] Entropy = "ACScan2Print-DeviceIdentity-Entropy-v1"u8.ToArray();

    public DpapiStorage()
    {
        _storageDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ACScan2Print",
            "Security"
        );
        Directory.CreateDirectory(_storageDirectory);
    }

    public void SaveProtectedSecret(string key, string plaintext)
    {
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Key cannot be empty", nameof(key));
        if (string.IsNullOrEmpty(plaintext)) throw new ArgumentException("Secret cannot be empty", nameof(plaintext));

        byte[] plainBytes = Encoding.UTF8.GetBytes(plaintext);
        byte[] encrypted = ProtectedData.Protect(plainBytes, Entropy, DataProtectionScope.CurrentUser);

        string filePath = GetFilePath(key);
        File.WriteAllBytes(filePath, encrypted);
    }

    public string? LoadProtectedSecret(string key)
    {
        string filePath = GetFilePath(key);
        if (!File.Exists(filePath)) return null;

        try
        {
            byte[] encrypted = File.ReadAllBytes(filePath);
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
        string filePath = GetFilePath(key);
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
        }
    }

    private string GetFilePath(string key)
    {
        string safeKey = Convert.ToBase64String(Encoding.UTF8.GetBytes(key)).Replace('/', '_');
        return Path.Combine(_storageDirectory, $"{safeKey}.dat");
    }
}

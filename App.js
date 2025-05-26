import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, Button, Alert, StyleSheet, Share, Platform, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import Papa from 'papaparse';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTziUOryoNtGBCpqIhdkM_jkEc9YAzVSYHC-CJNm3qxsxLuovUOrBjytfEIoP-DVi9gppBIl1VJy9iO/pub?output=csv';

export default function App() {
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [customer, setCustomer] = useState({ store: '', vat: '', notes: '' });
  const [location, setLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await Promise.all([
          loadProducts(),
          requestLocationPermission()
        ]);
      } catch (error) {
        Alert.alert("Initialization Error", "Failed to load app data");
      } finally {
        setAppReady(true);
      }
    };

    initializeApp();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await fetch(SHEET_URL);
      const csvText = await response.text();
      const parsed = Papa.parse(csvText, { header: true });
      setProducts(parsed.data.filter(p => p["Product Code"] && p["Product Description"]));
    } catch (error) {
      console.error("Failed to load products:", error);
      throw error;
    }
  };

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const location = await Location.getCurrentPositionAsync({});
      setLocation(location.coords);
    }
  };

  const handleQuantityChange = (code, qty) => {
    if (/^\d*$/.test(qty)) {
      setQuantities(prev => ({ ...prev, [code]: qty }));
    }
  };

  const saveFile = async (content, fileName) => {
    try {
      // Request permissions first
      const permissions = await MediaLibrary.requestPermissionsAsync();
      if (!permissions.granted) {
        throw new Error('Storage permission is required');
      }

      // Create the Downloads directory if it doesn't exist
      const downloadDir = `${FileSystem.documentDirectory}Downloads/`;
      const orderDir = `${downloadDir}Orders/`;
      
      try {
        await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
        await FileSystem.makeDirectoryAsync(orderDir, { intermediates: true });
      } catch (e) {
        console.log('Directory may already exist:', e);
      }

      // Save the file
      const fileUri = `${orderDir}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8
      });

      // Create asset in media library
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      
      // Create Orders album
      const album = await MediaLibrary.getAlbumAsync('Orders');
      if (album) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      } else {
        await MediaLibrary.createAlbumAsync('Orders', asset, false);
      }

      return fileUri;
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  };

  const exportCSV = async () => {
    try {
      setIsLoading(true);

      // Prepare CSV content
      const orderedProducts = products.filter(
        p => quantities[p["Product Code"]] && parseInt(quantities[p["Product Code"]]) > 0
      );

      if (orderedProducts.length === 0) {
        Alert.alert("No Products", "Please add quantities to at least one product");
        return;
      }

      const csvContent = [
        "Code,Description,Quantity",
        ...orderedProducts.map(p => 
          `${p["Product Code"]},${p["Product Description"]},${quantities[p["Product Code"]]}`
        ),
        `\nStore:,${customer.store || 'N/A'}`,
        `VAT:,${customer.vat || 'N/A'}`,
        `Notes:,${customer.notes || 'N/A'}`,
        location ? `Latitude:,${location.latitude}` : 'Latitude:,Not available',
        location ? `Longitude:,${location.longitude}` : 'Longitude:,Not available'
      ].join('\n');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `order_${timestamp}.csv`;

      if (Platform.OS === 'android') {
        try {
          const fileUri = await saveFile(csvContent, fileName);
          Alert.alert('Success', `File saved to Downloads/Orders/${fileName}`);
        } catch (error) {
          console.error('Save failed:', error);
          // Fallback to sharing
          await Share.share({
            title: 'Order Export',
            message: 'Here is the order export:',
            url: `data:text/csv;base64,${Buffer.from(csvContent).toString('base64')}`,
          });
        }
      } else {
        // For iOS, use sharing
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8
        });
        
        await Share.share({
          title: 'Order Export',
          message: 'Here is the order export:',
          url: fileUri,
        });
      }
    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert(
        'Export Failed', 
        error.message || 'Could not export the file. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!appReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text>Loading app...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Customer Information</Text>
      <TextInput
        style={styles.input}
        placeholder="Store Name"
        value={customer.store}
        onChangeText={text => setCustomer({ ...customer, store: text })}
      />
      <TextInput
        style={styles.input}
        placeholder="VAT Number"
        value={customer.vat}
        onChangeText={text => setCustomer({ ...customer, vat: text })}
      />
      <TextInput
        style={styles.input}
        placeholder="Notes"
        value={customer.notes}
        onChangeText={text => setCustomer({ ...customer, notes: text })}
        multiline
      />

      <Text style={styles.header}>Products</Text>
      <FlatList
        data={products}
        keyExtractor={(item, index) => `${item["Product Code"]}-${index}`}
        renderItem={({ item }) => (
          <View style={styles.productRow}>
            <Text>{item["Product Code"]} - {item["Product Description"]}</Text>
            <TextInput
              style={styles.qtyInput}
              keyboardType="numeric"
              onChangeText={text => handleQuantityChange(item["Product Code"], text)}
              placeholder="Qty"
            />
          </View>
        )}
        ListEmptyComponent={<Text>No products available</Text>}
      />

      <Button
        title={isLoading ? "Exporting..." : "Export CSV"}
        onPress={exportCSV}
        disabled={isLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 10,
    borderRadius: 5
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    width: 60,
    textAlign: 'center'
  }
});
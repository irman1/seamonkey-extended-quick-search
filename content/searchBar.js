/* -*- Mode: javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Communicator client code, released
 * March 31, 1998.
 *
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998-1999
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Seth Spitzer <sspitzer@netscape.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var gSearchSession = null;
var gPreQuickSearchView = null;
var gSearchTimer = null;
var gViewSearchListener;
var gSearchBundle;
var gProgressMeter = null;
var gSearchInProgress = false;
var gClearButton = null;
var gDefaultSearchViewTerms = null;
var gQSViewIsDirty = false;
var gNumTotalMessages;
var gNumUnreadMessages;

function SetQSStatusText(aNumHits)
{
  var statusMsg;
  // if there are no hits, it means no matches were found in the search.
  if (aNumHits == 0)
    statusMsg = gSearchBundle.getString("searchFailureMessage");
  else 
  {
    if (aNumHits == 1) 
      statusMsg = gSearchBundle.getString("searchSuccessMessage");
    else
      statusMsg = gSearchBundle.getFormattedString("searchSuccessMessages", [aNumHits]);
  }

  statusFeedback.showStatusString(statusMsg);
}

// nsIMsgSearchNotify object
var gSearchNotificationListener =
{
    onSearchHit: function(header, folder)
    {
      gNumTotalMessages++;
      if (!header.isRead)
        gNumUnreadMessages++;
        // XXX todo
        // update status text?
    },

    onSearchDone: function(status)
    {
        SetQSStatusText(gDBView.QueryInterface(Components.interfaces.nsITreeView).rowCount)
        statusFeedback.showProgress(0);
        gProgressMeter.setAttribute("mode", "normal");
        gSearchInProgress = false;

        // ### TODO need to find out if there's quick search within a virtual folder.
        if (gCurrentVirtualFolderUri &&
         (!gSearchInput || gSearchInput.value == "" || gSearchInput.showingSearchCriteria))
        {
          var vFolder = GetMsgFolderFromUri(gCurrentVirtualFolderUri, false);
          var dbFolderInfo = vFolder.msgDatabase.dBFolderInfo;
          dbFolderInfo.numUnreadMessages = gNumUnreadMessages;
          dbFolderInfo.numMessages = gNumTotalMessages;
          vFolder.updateSummaryTotals(true); // force update from db.
          var msgdb = vFolder.msgDatabase;
          msgdb.Commit(Components.interfaces.nsMsgDBCommitType.kLargeCommit);
          // now that we have finished loading a virtual folder,
          // scroll to the correct message if there is at least one.
          if (vFolder.getTotalMessages(false) > 0)
            ScrollToMessageAfterFolderLoad(vFolder);
        }
    },

    onNewSearch: function()
    {
      statusFeedback.showProgress(0);
      statusFeedback.showStatusString(gSearchBundle.getString("searchingMessage"));
      gProgressMeter.setAttribute("mode", "undetermined");
      gSearchInProgress = true;
      gNumTotalMessages = 0; 
      gNumUnreadMessages = 0;
    }
}

function getDocumentElements()
{
  gSearchBundle = document.getElementById("bundle_search");  
  gProgressMeter = document.getElementById('statusbar-icon');
  gClearButton = document.getElementById('clearButton');
  GetSearchInputEQS();
}

function addListeners()
{
  gViewSearchListener = gDBView.QueryInterface(Components.interfaces.nsIMsgSearchNotify);
  gSearchSession.registerListener(gViewSearchListener);
}

function removeListeners()
{
  gSearchSession.unregisterListener(gViewSearchListener);
}

function removeGlobalListeners()
{
  removeListeners();
  gSearchSession.unregisterListener(gSearchNotificationListener); 
}

function initializeGlobalListeners()
{
  // Setup the javascript object as a listener on the search results
  gSearchSession.registerListener(gSearchNotificationListener);
}

function createQuickSearchView()
{
  //if not already in quick search view 
  if (gDBView.viewType != nsMsgViewType.eShowQuickSearchResults)  
  {
    var treeView = gDBView.QueryInterface(Components.interfaces.nsITreeView);  //clear selection
    if (treeView && treeView.selection)
      treeView.selection.clearSelection();
    gPreQuickSearchView = gDBView;
    if (gDBView.viewType == nsMsgViewType.eShowVirtualFolderResults)
    {
      // remove the view as a listener on the search results
      var saveViewSearchListener = gDBView.QueryInterface(Components.interfaces.nsIMsgSearchNotify);
      gSearchSession.unregisterListener(saveViewSearchListener);
    }
    CreateDBView(gDBView.msgFolder, (gXFVirtualFolderTerms) ? nsMsgViewType.eShowVirtualFolderResults : nsMsgViewType.eShowQuickSearchResults, gDBView.viewFlags, gDBView.sortType, gDBView.sortOrder);
  }
}

function initializeSearchBar()
{
   createQuickSearchView();
   if (!gSearchSession)
   {
     var searchSessionContractID = "@mozilla.org/messenger/searchSession;1";
     gSearchSession = Components.classes[searchSessionContractID].createInstance(Components.interfaces.nsIMsgSearchSession);
     initializeGlobalListeners();
   }
   else
   {
     if (gSearchInProgress)
     {
       onSearchStop();
       gSearchInProgress = false;
     }
     removeListeners();
   }
   addListeners();
}

function onEnterInSearchBar()
{
   if (!gSearchBundle)
     getDocumentElements();
   viewDebug ("onEnterInSearchBar gSearchInput.value = " /* + gSearchInput.value + " showing criteria = " + gSearchInput.showingSearchCriteria */ +"\n");
   GetSearchInputEQS();
   if (gSearchInput.value == ""  /* || gSearchInput.showingSearchCriteria */) 
   {

    let viewType = gDBView && gDBView.viewType;
    if (viewType == nsMsgViewType.eShowQuickSearchResults ||
        viewType == nsMsgViewType.eShowVirtualFolderResults||true)
     {
       statusFeedback.showStatusString("");
       disableQuickSearchClearButton();

       viewDebug ("onEnterInSearchBar gDefaultSearchViewTerms = " + gDefaultSearchViewTerms + "gVirtualFolderTerms = " 
        + gVirtualFolderTerms + "gXFVirtualFolderTerms = " + gXFVirtualFolderTerms + "\n");
       var addTerms = gDefaultSearchViewTerms || gVirtualFolderTerms || gXFVirtualFolderTerms;
       if (addTerms)
       {
           viewDebug ("addTerms = " + addTerms + " count = " + addTerms.Count() + "\n");
           initializeSearchBar();
           onSearch(addTerms);
       }
       else
        restorePreSearchView();
     }
     else if (gPreQuickSearchView && !gDefaultSearchViewTerms)// may be a quick search from a cross-folder virtual folder
      restorePreSearchView();
     
//     gSearchInput.showingSearchCriteria = true;
     
     gQSViewIsDirty = false;
     return;
   }

   initializeSearchBar();

   if (gClearButton)
    gClearButton.setAttribute("disabled", false); //coming into search enable clear button   

   ClearThreadPaneSelection();
   ClearMessagePane();
   
   onSearch(null);
   gQSViewIsDirty = false;
}

function restorePreSearchView()
{
  var selectedHdr = null;
  //save selection
  try 
  {
    selectedHdr = gDBView.hdrForFirstSelectedMessage;
  }
  catch (ex)
  {}

  //we might have to sort the view coming out of quick search
  var sortType = gDBView.sortType;
  var sortOrder = gDBView.sortOrder;
  var viewFlags = gDBView.viewFlags;
  var folder = gDBView.msgFolder;

  gDBView.close();
  gDBView = null; 

  if (gPreQuickSearchView)
  {
    gDBView = gPreQuickSearchView;
    if (gDBView.viewType == nsMsgViewType.eShowVirtualFolderResults)
    {
      // readd the view as a listener on the search results
      var saveViewSearchListener = gDBView.QueryInterface(Components.interfaces.nsIMsgSearchNotify);
      if (gSearchSession)
        gSearchSession.registerListener(saveViewSearchListener);
    }
//    dump ("view type = " + gDBView.viewType + "\n");

    if (sortType != gDBView.sortType || sortOrder != gDBView.sortOrder)
    {
      gDBView.sort(sortType, sortOrder);
    }
    UpdateSortIndicators(sortType, sortOrder);

    gPreQuickSearchView = null;    
  }
  else //create default view type
    CreateDBView(folder, nsMsgViewType.eShowAllThreads, viewFlags, sortType, sortOrder);

  RerootThreadPane();
   
  var scrolled = false;
  
  // now restore selection
  if (selectedHdr)
  {
    gDBView.selectMsgByKey(selectedHdr.messageKey);
    var treeView = gDBView.QueryInterface(Components.interfaces.nsITreeView);
    var selectedIndex = treeView.selection.currentIndex;
    if (selectedIndex >= 0) 
    {
      // scroll
      EnsureRowInThreadTreeIsVisible(selectedIndex);
      scrolled = true;
    }
    else
      ClearMessagePane();
  }
  if (!scrolled)
    ScrollToMessageAfterFolderLoad(null);
}

function onSearch(aSearchTerms)
{
    viewDebug("in OnSearch, searchTerms = " + aSearchTerms + "\n");
    RerootThreadPane();

    if (aSearchTerms)
      createSearchTermsWithList(aSearchTerms);
    else
      createSearchTerms();

    gDBView.searchSession = gSearchSession;
    try
    {
      gSearchSession.search(msgWindow);
    }
    catch(ex)
    {
      dump("Search Exception\n");
    }
}

function createSearchTermsWithList(aTermsArray)
{
  var nsMsgSearchScope = Components.interfaces.nsMsgSearchScope;
  var nsMsgSearchAttrib = Components.interfaces.nsMsgSearchAttrib;
  var nsMsgSearchOp = Components.interfaces.nsMsgSearchOp;

  gSearchSession.clearScopes();
  var searchTerms = gSearchSession.searchTerms;
  var searchTermsArray = searchTerms.QueryInterface(Components.interfaces.nsISupportsArray);
  searchTermsArray.Clear();

  var i;
  var selectedFolder = GetThreadPaneFolder();
  if (gXFVirtualFolderTerms)
  {
    var msgDatabase = selectedFolder.msgDatabase;
    if (msgDatabase)
    {
      var dbFolderInfo = msgDatabase.dBFolderInfo;
      var srchFolderUri = dbFolderInfo.getCharProperty("searchFolderUri");
      viewDebug("createSearchTermsWithList xf vf scope = " + srchFolderUri + "\n");
      var srchFolderUriArray = srchFolderUri.split('|');
      for (i in srchFolderUriArray) 
      {
        let realFolder = GetMsgFolderFromUri(srchFolderUriArray[i]);
        if (!realFolder.isServer)
          gSearchSession.addScopeTerm(nsMsgSearchScope.offlineMail, realFolder);
      }
    }
  }
  else
  {
    viewDebug ("in createSearchTermsWithList, adding scope term for selected folder\n");
    gSearchSession.addScopeTerm(nsMsgSearchScope.offlineMail, selectedFolder);
  }
  // add each item in termsArray to the search session

  var termsArray = aTermsArray.QueryInterface(Components.interfaces.nsISupportsArray);
  for (i = 0; i < termsArray.Count(); ++i)
    gSearchSession.appendTerm(termsArray.GetElementAt(i).QueryInterface(Components.interfaces.nsIMsgSearchTerm));
}

function createSearchTerms()
{
  var nsMsgSearchScope = Components.interfaces.nsMsgSearchScope;
  var nsMsgSearchAttrib = Components.interfaces.nsMsgSearchAttrib;
  var nsMsgSearchOp = Components.interfaces.nsMsgSearchOp;

  // create an nsISupportsArray to store our search terms 
  var searchTermsArray = Components.classes["@mozilla.org/supports-array;1"].createInstance(Components.interfaces.nsISupportsArray);
  var selectedFolder = GetThreadPaneFolder();

  // implement | for QS
  // does this break if the user types "foo|bar" expecting to see subjects with that string?
  // I claim no, since "foo|bar" will be a hit for "foo" || "bar"
  // they just might get more false positives

 if(gSearchInput.value.lastIndexOf(":")>0){
    // extend quick search
         var searchValues = splitParameters(gSearchInput.value);                                                                               
          for (var i=0; i<searchValues.length; i++)  {                                                                                         
            var searchValue=searchValues[i];                                                                                                   
            var aTerm = buildTerm(searchValue);                                                                                                
            if(aTerm!=null){                                                                                                                   
                searchTermsArray.AppendElement(aTerm);                                                                                          
            }                                                                                                                                  
          }    
         
 }else{
  var termList = gSearchInput.value.split("|");
  for (var i = 0; i < termList.length; i ++)
  {
 
    // if the term is empty, skip it
    if (termList[i] == "")
      continue;

    // create, fill, and append the subject term
    var term = gSearchSession.createTerm();
    var value = term.value;
    value.str = termList[i];
    term.value = value;
    term.attrib = nsMsgSearchAttrib.Subject;
    term.op = nsMsgSearchOp.Contains;
    term.booleanAnd = false;
    searchTermsArray.AppendElement(term);

    // create, fill, and append the AllAddresses term
    term = gSearchSession.createTerm();
    value = term.value;
    value.str = termList[i];
    term.value = value;
    term.attrib = nsMsgSearchAttrib.AllAddresses;
    term.op = nsMsgSearchOp.Contains; 
    term.booleanAnd = false;
    searchTermsArray.AppendElement(term);
  }
}
  // now append the default view or virtual folder criteria to the quick search   
  // so we don't lose any default view information
  viewDebug("gDefaultSearchViewTerms = " + gDefaultSearchViewTerms + "gVirtualFolderTerms = " + gVirtualFolderTerms + 
    "gXFVirtualFolderTerms = " + gXFVirtualFolderTerms + "\n");
  var defaultSearchTerms = (gDefaultSearchViewTerms || gVirtualFolderTerms || gXFVirtualFolderTerms);
  if (defaultSearchTerms)
  {
    var isupports = null;
    var searchTerm; 
    var termsArray = defaultSearchTerms.QueryInterface(Components.interfaces.nsISupportsArray);
    for (i = 0; i < termsArray.Count(); i++)
    {
      isupports = termsArray.GetElementAt(i);
      searchTerm = isupports.QueryInterface(Components.interfaces.nsIMsgSearchTerm);
      searchTermsArray.AppendElement(searchTerm);
    }
  }
  
  createSearchTermsWithList(searchTermsArray);
  
  // now that we've added the terms, clear out our input array
  searchTermsArray.Clear();
}

function onAdvancedSearch()
{
  MsgSearchMessages();
}

function onSearchStop() 
{
  gSearchSession.interruptSearch();
}

function onClearSearch()
{
  // Use the last focused element so that focus can be restored
  // if it does not exist, try and get the thread tree instead
  var focusedElement = gLastFocusedElement || GetThreadTree();
  Search("");
  focusedElement.focus();
}

function disableQuickSearchClearButton()
{
 if (gClearButton)
   gClearButton.setAttribute("disabled", true); //going out of search disable clear button
}

function ClearQSIfNecessary()
{
  GetSearchInputEQS();

  if (gSearchInput.value == "")
    return;

  Search("");
}

function Search(str)
{
  GetSearchInputEQS();

  viewDebug("in Search str = " + str + "gSearchInput.showingSearchCriteria = " + gSearchInput.showingSearchCriteria + "\n");

  if (str != gSearchInput.value)
  {
    gQSViewIsDirty = true; 
    viewDebug("in Search(), setting gQSViewIsDirty true\n");
  }

  gSearchInput.value = str;  //on input does not get fired for some reason
  onEnterInSearchBar();
}

function saveViewAsVirtualFolder()
{
  openNewVirtualFolderDialogWithArgs(gSearchInput.value, gSearchSession.searchTerms);
}


function GetSearchInputEQS()
{
//  if (!gSearchInput)
//    gSearchInput = document.getElementById("eqsSearchInput");
//  return gSearchInput;
return GetSearchInput();
}

function parseDate(dateString){
 if(dateString == null)
  return; 
 var bits = dateString.split(/\D/);
 var date = new Date(bits[0], --bits[1], bits[2], bits[3], bits[4],bits[5]);
 return date
}

function splitParameters(searchValue){
    var ret = [];
    var searchValues = searchValue.split(" "); 
    var previousParameter='';
    for (var i=0; i<searchValues.length; i++)  {
        var searchValue=searchValues[i];
        if(searchValue.indexOf(":")>-1){
           if(previousParameter!='')
            ret.push(previousParameter);
           previousParameter=searchValue;
        }else{
            previousParameter=previousParameter+" "+searchValue
        }
    }
    if(previousParameter!='')
     ret.push(previousParameter);
    
    return ret; 
  }

function buildTerm(searchValue){
            var parts = searchValue.split(":");
            if(parts == null || parts == undefined || parts.length!=2)
               return null;
            var skey = parts[0];
            var svalue = parts[1];
            if(skey == null || skey == undefined || skey == '' || svalue == null || svalue == undefined || svalue == '' )
               return null;
            var searchValue=skey;
            let searchKeyword = svalue;
            var flag = false;
	          var term = gSearchSession.createTerm();
	          var value = term.value;
	          value.str = searchKeyword;
	          term.value = value;
	          term.op = nsMsgSearchOp.Contains;
	          term.booleanAnd = true;
            if(searchValue=="body"||searchValue=="b"){
                term.attrib = nsMsgSearchAttrib.Body;               
                flag=true;
             } else if(searchValue=="subject"||searchValue=="s"){
                term.attrib = nsMsgSearchAttrib.Subject;
                flag=true;
             }else if(searchValue=="from"||searchValue=="f"){
                term.attrib = nsMsgSearchAttrib.Sender;
                flag=true;
             }else if(searchValue=="to"||searchValue=="t"){
                term.attrib = nsMsgSearchAttrib.To;
                flag=true;
             }else if(searchValue=="c"||searchValue=="cc"){
                term.attrib = nsMsgSearchAttrib.CC;
                 flag=true;                                                                                                                   
             }else if(searchValue=="attachment"){
                 //term.attrib = nsMsgSearchAttrib.HasAttachmentStatus;
                 //flag=true;
             }else if(searchValue=="date"||searchValue=="d"){
                  var datE = parsDate(createDateString(searchKeyword));
                  var searchTerm=gSearchSession.createTerm();
                  var value = searchTerm.value;
                  value.attrib=nsMsgSearchAttrib.Date;
                  value.date=datE.getTime() * 1000;
                  searchTerm.attrib=nsMsgSearchAttrib.Date;
                  searchTerm.op=nsMsgSearchOp.Is;
                  searchTerm.value=value;
                  searchTerm.booleanAnd = true;
                  return searchTerm;
                  term=searchTerm;
                  flag=true;
            }else if(searchValue=="after"||searchValue=="af"){
                  var datE = parsDate(createDateString(searchKeyword));
                  var searchTerm=gSearchSession.createTerm();
                  var value = searchTerm.value;
                  value.attrib=nsMsgSearchAttrib.Date;
                  value.date=datE.getTime() * 1000;
                  searchTerm.attrib=nsMsgSearchAttrib.Date;
                  searchTerm.op=nsMsgSearchOp.IsAfter;
                  searchTerm.value=value;
                  searchTerm.booleanAnd = false;
                  return searchTerm;
                  term=searchTerm;
                  flag=true;
            }else if(searchValue=="before"||searchValue=="be"){
                  var datE = parsDate(createDateString(searchKeyword));
                  var searchTerm=gSearchSession.createTerm();
                  var value = searchTerm.value;
                  value.attrib=nsMsgSearchAttrib.Date;
                  value.date=datE.getTime() * 1000;
                  searchTerm.attrib=nsMsgSearchAttrib.Date;
                  searchTerm.op=nsMsgSearchOp.IsBefore;
                  searchTerm.value=value;
                  searchTerm.booleanAnd = true;
                  return searchTerm;
                  term=searchTerm;
                  flag=true;
            }
           
      if(flag==false)
         return  null;
      return term;

}

function isValidDate(d) {
  if ( d == null || d == undefined || d.toString() =="" ||d.toString() =="undefined" || Object.prototype.toString.call(d) !== "[object Date]" || d.toString() =="Invalid Date"){
    return false;
    }
  return true;
}


function parsDate(dateString){
 if(dateString == null)
  return; 
 var bits = dateString.split(/\D/);
 var date = new Date(bits[0], --bits[1], bits[2], bits[3], bits[4],bits[5]);
 return date
}

function createDateString(inputDate){
    if(inputDate.indexOf(".")>0)
      return createDateStringFromGermanFormat(inputDate);
    //yyyy/mm/dd hh:mm:ss
    var year = +inputDate.substring(0,4);
    var month = +inputDate.substring(5,7) ;
    var day = +inputDate.substring(8,10);
    return makeDateString(year,month,day,inputDate);
}

function createDateStringFromGermanFormat(inputDate){
    //German format:dd.mm.yyyy
    var day = +inputDate.substring(0,2);
    var month = +inputDate.substring(3,5) ;
    var year = +inputDate.substring(6,10);
    if(isDayNull(inputDate)){
     month = +inputDate.substring(0,2);
     year = +inputDate.substring(3,7) ;
     day = null;
    }
    return makeDateString(year,month,day,inputDate);
}

function isDayNull(input){
  if(input.length==7)
       return true;
  return false;   
}

function isTimeNull(input){
   if(input.length==10)
       return true;
  return false;   
}

function makeDateString(year,month,day,inputDate){
   if(isNaN(month)||isNaN(year)) {
      
      return;
    };
    var hour = +inputDate.substring(11,13);
    var minute = +inputDate.substring(14,16);
    var second = +inputDate.substring(17,19);
    if(isNaN(day))
       day="01";
    if(isNaN(hour))
      hour="00";
    if(isNaN(minute))
      minute="00";
    if(isNaN(second))
      second="00";
    return year+"-"+month+"-"+day+" "+hour+":"+minute+":"+second;
}


